# 0001 — Deploy to k3s on Linode with Argo CD, Vault and Helm

- **Status:** Accepted, stages 0–2 implemented (stage 2 applied 2026-10-01)
- **Date:** 2026-09-25, revised 2026-09-26 (compute, storage, budget and probes)
- **Replaces:** Vercel git-integration deploys and Vercel Cron

## Context

Production today is Vercel's git integration (`vercel.json`) against Neon Postgres. Migrations
run only inside a Vercel production build (`scripts/build.ts:94-133`). The nightly sweep is a
Vercel Cron calling `/api/cron/nightly-sweep` with `CRON_SECRET`. There is no container registry,
and CI (`.github/workflows/ci.yml`) runs on pull requests only.

The goal of the move is **portfolio and learning**: to run the app the way a GitOps shop would,
on Kubernetes, with Vault holding secrets and Helm packaging everything. Some operational toil is
accepted as the price of that. Reliable hosting alone would not justify this stack.

### Budget

Issue #1's constraint 7 caps the project at **about £5 a month**. No Kubernetes design with
Argo CD and Vault fits that on Linode. The only plan under £5 is the 1 GB Nanode, and k3s plus
the app alone take most of it. **This decision raises the ceiling to about $25 a month
(roughly £19)**, knowingly, as the cost of the portfolio goal. Constraint 7 in issue #1 has to
be revised to match.

The first draft of this ADR picked LKE on an 8 GB node, which came to about $64 a month. It was
revised before any infrastructure existed.

| Item | Monthly |
|---|---|
| Linode 4 GB shared VM | $24.00 |
| Block Storage, 10 GB (Vault) | $1.00 |
| Cloudflare R2 (Terraform state, Vault snapshots), under the 10 GB free tier | $0 |
| **Total** | **≈ $25** |

Prices are from Akamai's North America pricing page, read 2026-09-26.

## Decision

### Infrastructure — Terraform

- **Compute.** **k3s on one Linode 4 GB VM.** Terraform creates the VM and cloud-init installs
  k3s. There is no NodeBalancer: k3s's built-in ServiceLB binds 80 and 443 on the VM's own
  public IP. k3s's bundled Traefik is disabled (`--disable traefik`), so Argo CD installs and
  owns Traefik like everything else.
- **Secrets at rest.** k3s is installed with `--secrets-encryption`. Without it, k3s keeps every
  Kubernetes Secret, including each one External Secrets copies out of Vault, unencrypted in
  its datastore on the VM's disk.
- **One VM, knowingly.** A VM failure or reboot is a full outage, and Vault comes back sealed.
  k3s upgrades are ours to run; nothing replaces the node for us.
- **Terraform state.** Kept in a private Cloudflare R2 bucket through the S3 backend, with
  `use_lockfile` locking. That bucket is **created by hand**: Terraform can't create the bucket
  its own state lives in. R2 has no bucket versioning, so state backups are taken by hand
  (`infra/terraform/README.md`). The kubeconfig is **not** in state: `fetch-kubeconfig` copies
  it over SSH to the laptop, so the state never holds cluster-admin credentials.
- **Where the code lives.** `infra/terraform/` in this repo, run through `./tf`, which loads
  the Linode, Cloudflare and R2 tokens from Bitwarden into that one process's environment.
- **Region and access.** `us-iad` (Washington DC), next to Neon's `aws-us-east-1`, on Ubuntu
  24.04. A Linode Cloud Firewall allows 80/443 from anywhere and SSH/6443 only from the
  laptop's current IP. Unattended security upgrades are on; automatic reboots are off, because
  a reboot seals Vault.
- **Rebuilds.** Changing cloud-init, the image or the SSH key replaces the VM. That is
  intended: the cluster is rebuilt from git, and Vault's volume is reattached and mounted
  without formatting (`lifecycle { prevent_destroy = true }` guards it).
- **DNS.** Cloudflare A records for the root, `staging.` and `argocd.` hosts, pointing at the
  VM's public IP. Cloudflare proxy is off so cert-manager's HTTP-01 challenge works.
- **Vault's disk.** A 10 GB Linode Block Storage volume, attached by Terraform, mounted on the
  host and given to Vault as a local PersistentVolume. It survives the VM being rebuilt.
- **Argo CD bootstrap.** Terraform `helm_release` installs Argo CD once, together with a single
  root Application. From then on Argo manages everything, including its own chart, through
  app-of-apps.
- **Vault configuration.** A second Terraform root, run over `kubectl port-forward`, manages the
  KV v2 mount, the Kubernetes auth roles, per-environment policies and Google OIDC login. It never
  manages secret values. Its first apply runs with the root token, and creates the admin policy
  and the Google login. After that it runs with the token from `vault login -method=oidc`, and
  the root token is revoked. The admin OIDC client secret still lands in its state, because the
  OIDC login config has to carry it.

### GitOps

- **Repository.** A separate repo, `Joyaroin/mediasafe-gitops`, holds:
  - `charts/mediasafe`, with `values-staging.yaml` and `values-prod.yaml`;
  - the app-of-apps `Application`s;
  - the platform charts: Vault, External Secrets Operator, cert-manager, Traefik and Valkey.
- **Sync policy.** Every Application is automated, with prune and selfHeal. Git is the only way
  to change the cluster.
- **Argo CD UI.** Public at `argocd.<domain>`, signed in with Google OIDC (native, no Dex) and
  restricted to Adham's email. It uses its own Google OAuth client, separate from the app's
  sign-in client. It goes public only **after Vault exists** (stage 5), because its OIDC client
  secret comes from Vault through External Secrets. Until then it's reached by port-forward.
- **Argo CD's access to the gitops repo.** A read-only deploy key on `mediasafe-gitops`, added
  as Argo CD's repository credential at bootstrap. CI writes to that repo with a separate
  fine-grained PAT (see Delivery).

### Delivery

1. **PR CI** (`ci.yml`) stays as the pull-request gate. It also runs the cache-handler test
   against a Valkey service container (see Runtime).
2. **Build.** A push to `main` builds the image and pushes it to
   `ghcr.io/joyaroin/mediasafe:<sha>`. The package is private.
   - Sentry source maps are uploaded in the same build, using `SENTRY_AUTH_TOKEN` passed as a
     BuildKit secret.
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG` and `SENTRY_PROJECT` are build arguments. The DSN
     is baked into the browser bundle, which is why build-time values come from Actions
     secrets rather than Vault.
3. **Staging deploy.** CI then commits the new tag into `values-staging.yaml`, authenticating
   with a fine-grained PAT. The PAT must be rotated by hand before it expires; when it lapses the
   push fails and the workflow goes red.
4. **Prod promotion.** A manual `workflow_dispatch` copies the staging tag into
   `values-prod.yaml`.
5. **Migrations.** An Argo CD `PreSync` hook Job runs `node dist/migrate.mjs` from the same
   image before the Deployment rolls. The runner is `db/migrate.ts` bundled with esbuild; the
   container build itself never migrates, because `VERCEL` is unset. This relies on the
   existing expand-contract, forward-only migration rule.

### Runtime

One image serves both environments. `SENTRY_ENVIRONMENT` is set per namespace, and the Sentry
server SDK reads it with no code change. The browser SDK can't: its config is baked in at build
time, so staging's browser errors are tagged the same as prod's.

| | Staging | Prod |
|---|---|---|
| Namespace | `mediasafe-staging` | `mediasafe-prod` |
| Replicas | 1 | 2 |
| Database | Neon branch seeded from `fixtures/mediasafe-seed.json` (no real user data) | Neon, pooled URL, unchanged |
| Valkey | Own pod, no volume | Own pod, no volume |
| Vault path | `kv/mediasafe/staging/*` | `kv/mediasafe/prod/*` |
| Nightly sweep | 07:00 UTC | 09:00 UTC |
| Hostname | `staging.<domain>` | `<domain>` |

- **Shared cache** (`cache-handler.mjs`, implemented).
  - *Why it's needed.* The app caches reads with `unstable_cache` and clears them with
    `revalidateTag`/`updateTag` (`cache/tags.ts`, `cache/borrowed-facts.ts`). Self-hosted, each
    pod keeps its own cache, so an invalidation reaches only the pod that received it.
  - *What it does.* Entries and per-tag invalidation timestamps live in Valkey. `get` itself
    checks an entry against its tags' timestamps, because Next's built-in check reads an
    in-process map that only the file-system handler writes.
  - *A stale-while-revalidate clear is a miss.* `revalidateTag(tag, "max")` is answered with a
    miss, not by serving the old entry once. The library reads have no `revalidate` window, so
    an old entry handed back would be served forever. Readers get fresher data than on Vercel,
    at the cost of one blocking read after each write.
  - *When Valkey is down.* Reads are a miss; failures go to Sentry, at most once a minute per
    operation. Entries expire from Valkey after a day, which caps how long a lost invalidation
    can last.
  - *When it's switched on.* In every build where `VERCEL` is unset, because Next fixes this
    setting at build time. With no `VALKEY_URL` at run time, nothing is cached.
- **Cache-handler test.** Staging runs one replica, so it can't show cross-pod invalidation.
  CI tests it instead: two handler instances share one real Valkey, one revalidates a tag, and
  the other must then treat the entry as gone.
- **Nightly sweep.** A CronJob curls the in-cluster Service at `/api/cron/nightly-sweep` with
  `Bearer CRON_SECRET`. It must stay HTTP, because the route's cache busting only works inside
  the Next.js runtime (see `route.ts`).
- **Probes.** Liveness and readiness probes hit **`/sign-in`**, which is already exempt from
  `proxy.ts`. There is no new route: constraint 5 forbids adding unauthenticated routes. Without
  a session cookie, `/sign-in` renders 200 even with the database unreachable (checked
  2026-09-26), so a Neon blip doesn't restart healthy pods. If a database call is ever added to
  that page before the session check, the probes start depending on Neon.
- **Secrets.** External Secrets Operator syncs Vault into ordinary Kubernetes Secrets, so the app
  still reads `process.env`. Each namespace has its own `SecretStore` and Vault role, so staging
  cannot read prod's secrets. The GHCR pull secret is a `read:packages` token in Vault, rendered
  by ESO as a `dockerconfigjson` Secret.
- **Ingress.** Traefik implements Gateway API. cert-manager issues Let's Encrypt certificates via
  HTTP-01.
- **NetworkPolicies.** Default-deny in each namespace, enforced by k3s's built-in network-policy
  controller, with explicit allows:
  - gateway → app;
  - app → Valkey;
  - ESO → Vault;
  - egress to Neon, TMDB, Google and Sentry.

### Vault

- **Deployment.** In-cluster, from the official Helm chart, with integrated Raft storage on the
  Block Storage volume. The API and UI are reachable **only by `kubectl port-forward`**; the UI
  shares a listener with the whole API, so it is never routed publicly.
- **Unseal and root token.** Initialised with `-key-shares=1 -key-threshold=1`, and the unseal
  key is kept in the password manager. Linode has no KMS, so there's no auto-unseal: every pod
  restart needs a manual unseal. The root token is revoked after bootstrap, but only once the
  Google admin login has been shown to work. If that login breaks later,
  `vault operator generate-root` makes a new root token from the unseal key.
- **Secret values.** Entered by hand with `vault kv put`, never through Terraform (they would
  land in state in plaintext) and never through git.
- **Backup.** A nightly `vault operator raft snapshot save` CronJob writes to Cloudflare R2. The
  restore is tested once and written down before stage 6.

### Cutover

1. Stand up staging completely and verify sign-in, the sweep and a deploy.
2. Deploy prod on the new domain with its CronJob **suspended**. Freeze merges to `main` from
   here until step 5, because Vercel and the PreSync Job would both migrate the same Neon
   database.
3. Add the new origin to the Google OAuth redirect URIs, and set `BETTER_AUTH_URL`.
4. Turn off Vercel's git deploys and its cron, so there's no second migrator and no double
   sweep.
5. Unsuspend the prod CronJob and lift the merge freeze.
6. Delete the Vercel project, `vercel.json`, and the `VERCEL`/`VERCEL_ENV` branches in
   `scripts/build.ts` and `next.config.ts`. Update the README ("single deploy target") and
   `CLAUDE.md`'s stack line.

## Consequences

- **The monthly bill rises** from $0 to about $25.
- **Preview deploys are gone.** Per-PR Vercel previews are replaced by one long-lived staging
  environment.
- **Deploys and upgrades cause downtime.** On one VM, rollouts are only as safe as two replicas
  on one host allow, and k3s upgrades and reboots are outages.
- **Recurring manual tasks.** Vault needs a manual unseal after every pod restart and every
  reboot. The CI PAT needs rotating before it expires.
- **Monitoring is deferred.** v1 relies on Sentry plus `kubectl`.

## Alternatives rejected

- **Compute.**
  - LKE on 1 × 8 GB (the first draft): about $64 a month with the NodeBalancer and Object
    Storage.
  - LKE on 1 × 4 GB: about $34 a month. It still needs the $10 NodeBalancer, LKE's system pods
    take part of the 4 GB, and whether a 1-node pool is allowed wasn't verified.
  - k3s on a 2 GB VM ($12): fits only with Flux, no staging and one prod replica, which also
    makes the shared cache pointless.
  - Oracle Cloud Always Free ARM: the only £0 option, but not Linode, it needs multi-arch
    images, and idle instances get reclaimed.
  - kubeadm: too much upkeep for one app.
- **Object storage.** Linode Object Storage: a $5 monthly minimum for data that fits R2's free
  tier.
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
- **Probes.** A new `/api/healthz` route: it would be the first truly unauthenticated route,
  against constraint 5.
- **Ingress controllers.** ingress-nginx: upstream announced its retirement in late 2025.

## Unverified at time of writing

- Whether Neon's project is in `aws-us-east-1`; `us-iad` is only the right region if so.
- ingress-nginx's current retirement status (it is not used either way).

## Rollout

0. **Get the app ready for containers.** ✅ Done on `infra-migration`: the production image,
   the bundled migrator, the Valkey cache handler and its CI test, and the env docs.
1. **Build and push the image.** ✅ Written on `infra-migration` as
   `.github/workflows/image.yml`: on every push to `main` it pushes
   `ghcr.io/joyaroin/mediasafe:<sha>` (amd64, no attestations) and keeps the newest ten
   versions. It first runs when the branch merges, so pulling from GHCR is not yet verified.
2. **Infrastructure.** ✅ Applied 2026-10-01 from `infra/terraform/`: VM `mediasafe-node`
   at 139.144.213.62, the 10 GB Vault volume mounted at `/mnt/vault-data`, k3s
   `v1.36.4+k3s1` Ready with secrets encryption on and no bundled Traefik, and the three
   Cloudflare records resolving. Verified: R2 state locking blocks a concurrent plan, and
   `kubectl` reaches the API over the public IP without a `tls-san` change.
3. **GitOps bootstrap.** Argo CD, the root Application and the `mediasafe-gitops` repo.
4. **Ingress and TLS.** Traefik and cert-manager.
5. **Vault and ESO.** Also the snapshot CronJob, with a restore actually tested, and then Argo
   CD made public with Google sign-in.
6. **Staging app.**
7. **NetworkPolicies.**
8. **Prod on k3s, beside Vercel.**
9. **Cutover.**
10. **Cleanup.**
