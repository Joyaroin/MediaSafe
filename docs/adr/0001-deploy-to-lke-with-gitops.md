# 0001 — Deploy to LKE with Argo CD, Vault and Helm

- **Status:** Accepted, not yet implemented
- **Date:** 2026-09-25
- **Replaces:** Vercel git-integration deploys and Vercel Cron

## Context

Production today is Vercel's git integration (`vercel.json`) against Neon Postgres. Migrations
run only inside a Vercel production build (`scripts/build.ts:94-133`). The nightly sweep is a
Vercel Cron calling `/api/cron/nightly-sweep` with `CRON_SECRET`. There is no container registry,
and CI (`.github/workflows/ci.yml`) runs on pull requests only.

The goal of the move is **portfolio and learning**: to run the app the way a GitOps shop would,
on Kubernetes, with Vault holding secrets and Helm packaging everything. Some operational toil is
accepted as the price of that. Reliable hosting alone would not justify this stack.

## Decision

### Infrastructure — Terraform

- **Cluster.** LKE (managed Kubernetes on Linode) with one node pool of **1 × 8 GB**. A node
  failure or an LKE version upgrade, which replaces the node, is a full outage, and Vault comes
  back sealed. That is accepted.
- **Terraform state.** Kept in a private Linode Object Storage bucket. The state holds the
  kubeconfig in plaintext and Terraform has no state encryption, so the bucket's access key lives
  only in the password manager.
- **DNS.** Cloudflare A records for the root, `staging.` and `argocd.` hosts, pointing at the
  NodeBalancer IP. Cloudflare proxy is off so cert-manager's HTTP-01 challenge works.
- **Argo CD bootstrap.** Terraform `helm_release` installs Argo CD once, together with a single
  root Application. From then on Argo manages everything, including its own chart, through
  app-of-apps.
- **Vault configuration.** A second Terraform root, run over `kubectl port-forward`, manages the
  KV v2 mount, the Kubernetes auth roles, per-environment policies and Google OIDC login. It never
  manages secret values.

### GitOps

- **Repository.** A separate repo, `Joyaroin/mediasafe-gitops`, holds:
  - `charts/mediasafe`, with `values-staging.yaml` and `values-prod.yaml`;
  - the app-of-apps `Application`s;
  - the platform charts: Vault, External Secrets Operator, cert-manager, Traefik and Valkey.
- **Sync policy.** Every Application is automated, with prune and selfHeal. Git is the only way
  to change the cluster.
- **Argo CD UI.** Public at `argocd.<domain>`, signed in with Google OIDC (native, no Dex) and
  restricted to Adham's email. It uses its own Google OAuth client, separate from the app's
  sign-in client.

### Delivery

1. **PR CI** (`ci.yml`) stays as the pull-request gate. It gains a Valkey service container for
   the cache-handler test (see Runtime).
2. **Build.** A push to `main` builds the image and pushes it to
   `ghcr.io/joyaroin/mediasafe:<sha>`. The package is private. Sentry source maps are uploaded in
   the same step, using `SENTRY_AUTH_TOKEN` from Actions secrets. `NEXT_PUBLIC_SENTRY_DSN` is
   baked in at build time, which is why build-time values live in Actions secrets rather than
   Vault.
3. **Staging deploy.** CI then commits the new tag into `values-staging.yaml`, authenticating
   with a fine-grained PAT. The PAT must be rotated by hand before it expires; when it lapses the
   push fails and the workflow goes red.
4. **Prod promotion.** A manual `workflow_dispatch` copies the staging tag into
   `values-prod.yaml`.
5. **Migrations.** An Argo CD `PreSync` hook Job runs `db/migrate.ts` from the same image before
   the Deployment rolls. The container build does not migrate, because `VERCEL` is unset. This
   relies on the existing expand-contract, forward-only migration rule.

### Runtime

One image serves both environments. `SENTRY_ENVIRONMENT` is set at runtime so staging errors
don't mix with prod's.

| | Staging | Prod |
|---|---|---|
| Namespace | `mediasafe-staging` | `mediasafe-prod` |
| Replicas | 1 | 2 |
| Database | Neon branch seeded from `fixtures/mediasafe-seed.json` (no real user data) | Neon, pooled URL, unchanged |
| Valkey | Own pod, no volume | Own pod, no volume |
| Vault path | `kv/mediasafe/staging/*` | `kv/mediasafe/prod/*` |
| Nightly sweep | 07:00 UTC | 09:00 UTC |
| Hostname | `staging.<domain>` | `<domain>` |

- **Shared cache.**
  - *Why it's needed.* The app caches reads with `unstable_cache` and clears them with
    `revalidateTag`/`updateTag` (`cache/tags.ts`, `cache/borrowed-facts.ts`). Self-hosted, each
    pod keeps its own cache, so an invalidation reaches only the pod that received it.
  - *What we build.* Our own `cacheHandler` backed by Valkey, configured with
    `cacheMaxMemorySize: 0`, and modelled on Vercel's `cache-handler-redis` example.
  - *When Valkey is down.* `get` returns a cache miss, and failures go to Sentry rather than a
    silent catch, per `AGENTS.md`'s error rules.
- **Cache-handler test.** Staging runs one replica, so it can't show cross-pod invalidation.
  CI tests it instead: two handler instances share one real Valkey, one revalidates a tag, and
  the other must then read the entry as stale.
- **Nightly sweep.** A CronJob curls the in-cluster Service at `/api/cron/nightly-sweep` with
  `Bearer CRON_SECRET`. It must stay HTTP, because the route's cache busting only works inside
  the Next.js runtime (see `route.ts`).
- **Probes.** A new `/api/healthz` route that doesn't touch the database, so a Neon blip doesn't
  restart healthy pods. It becomes the fourth named exemption in `proxy.ts`'s matcher and in
  `tests/route-manifest.test.ts`'s `EXEMPT` list, per #43.
- **Secrets.** External Secrets Operator syncs Vault into ordinary Kubernetes Secrets, so the app
  still reads `process.env`. Each namespace has its own `SecretStore` and Vault role, so staging
  cannot read prod's secrets. The GHCR pull secret is a `read:packages` token in Vault, rendered
  by ESO as a `dockerconfigjson` Secret.
- **Ingress.** Traefik implements Gateway API. cert-manager issues Let's Encrypt certificates via
  HTTP-01.
- **NetworkPolicies.** Default-deny in each namespace, with explicit allows:
  - gateway → app;
  - app → Valkey;
  - ESO → Vault;
  - egress to Neon, TMDB, Google and Sentry.

### Vault

- **Deployment.** In-cluster, from the official Helm chart, with integrated Raft storage on a
  Linode Block Storage volume. The API and UI are reachable **only by `kubectl port-forward`**;
  the UI shares a listener with the whole API, so it is never routed publicly.
- **Unseal and root token.** Initialised with `-key-shares=1 -key-threshold=1`, and the unseal
  key is kept in the password manager. Linode has no KMS, so there's no auto-unseal: every pod
  restart needs a manual unseal. The root token is revoked after bootstrap.
- **Secret values.** Entered by hand with `vault kv put`, never through Terraform (they would
  land in state in plaintext) and never through git.
- **Backup.** A nightly `vault operator raft snapshot save` CronJob writes to Linode Object
  Storage. The restore is tested once and written down.

### Cutover

1. Stand up staging completely and verify sign-in, the sweep and a deploy.
2. Deploy prod on the new domain with its CronJob **suspended**.
3. Add the new origin to the Google OAuth redirect URIs, and set `BETTER_AUTH_URL`.
4. Turn off Vercel's git deploys and its cron, so there's no second migrator and no double
   sweep.
5. Unsuspend the prod CronJob.
6. Delete the Vercel project, `vercel.json`, and the `VERCEL`/`VERCEL_ENV` branches in
   `scripts/build.ts`. Update the README ("single deploy target") and `CLAUDE.md`'s stack line.

## Consequences

- **Preview deploys are gone.** Per-PR Vercel previews are replaced by one long-lived staging
  environment.
- **Deploys cause brief downtime.** On one node, rollouts are only as safe as two replicas on
  one host allow.
- **Recurring manual tasks.** Vault needs a manual unseal after every pod restart and every LKE
  upgrade. The CI PAT needs rotating before it expires.
- **Monitoring is deferred.** v1 relies on Sentry plus `kubectl`; kube-prometheus-stack would
  need a bigger node.

## Alternatives rejected

- **Clusters.**
  - k3s on one VM: we'd have to run upgrades and backups ourselves.
  - kubeadm: too much upkeep for one app.
- **GitOps controllers.**
  - Flux: Argo CD's UI and its place in job postings suit the portfolio goal better.
- **Vault hosting.**
  - A separate VM: sits outside GitOps.
  - HCP Vault Dedicated: costs more than the rest of the stack.
- **Databases.**
  - CloudNativePG or Linode Managed Postgres: either would need wsproxy in prod or a second DB
    driver, which breaks the README's "one data path" rule.
- **How secrets reach the pod.**
  - Vault Agent Injector: file-based secrets need a wrapper to become `process.env`.
  - Vault Secrets Operator: works only with Vault, so the skill transfers less.
- **Migration runners.**
  - Init containers: race each other once there's more than one replica.
  - A CI step: would put the prod DB credential in GitHub.
- **Cron.** Running the sweep as a script would skip its Next.js cache busting.
- **Ingress controllers.** ingress-nginx: upstream announced its retirement in late 2025.

## Unverified at time of writing

- Linode prices for the 8 GB node, the NodeBalancer and Object Storage.
- Whether the Terraform S3 backend's state locking works on Linode Object Storage.
- ingress-nginx's current retirement status.

## Open before building

- The uncommitted `Dockerfile`, `.dockerignore`, `next.config.ts` (`output: "standalone"`) and
  `.gitignore` changes on `main` need reviewing and committing first. The container doesn't run
  migrations; the PreSync Job fills that gap.
- `CRON_SECRET` is missing from `.env.example`.
