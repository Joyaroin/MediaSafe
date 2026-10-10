# Infra migration — handoff

Where the move from Vercel to k3s-on-Linode stands, and exactly what comes next. Written
2026-10-10 so a fresh session can continue without the conversation that produced it.

**Read first:** [ADR 0001](adr/0001-deploy-to-k3s-on-linode-with-gitops.md) is the decision record
(the *why*, every rejected alternative, the rollout list). This file is the *where we are* and
*what to do next*. When this file and the live system disagree, the live system wins: check
with the commands in [Verify the current state](#verify-the-current-state).

---

## 1. Where everything lives

| What | Where |
|---|---|
| App repo | `~/MediaSafe`, branch **`infra-migration`**, ahead of `main` (`git log main..infra-migration`), **not pushed**. Everything ships as **one big PR** (Adham's choice). |
| GitOps repo | `~/mediasafe-gitops` → `github.com/Joyaroin/mediasafe-gitops` (private), branch `main`, pushed. Argo CD syncs it. |
| VM Terraform | `MediaSafe/infra/terraform/` — run with `./tf` |
| Vault Terraform | `MediaSafe/infra/vault/` — run with `./tf` (`--root` was the first apply only) |
| Cluster bootstrap | `mediasafe-gitops/bootstrap/` — `install`, `create-deploy-key`, `vault-init`, `vault-unseal` |
| Kubeconfig | `~/.kube/mediasafe.yaml` (cluster-admin; never in Terraform state) |
| State backup | `~/mediasafe-tfstate-2026-10-01.json` (mode 600) |
| Visual map of the cluster | claude.ai artifact "MediaSafe Cluster Map" (snapshot of 4 Oct, stages 0–4) |

**Untouched on purpose:** Adham's deleted `.impeccable/` files in the MediaSafe working tree are
his own uncommitted change; leave them out of every commit.

---

## 2. The design in one screen

- **One Linode 4 GB VM** (`mediasafe-node`, `us-iad`, `139.144.213.62`, Ubuntu 24.04) running
  **k3s v1.36.4+k3s1**, secrets encryption on, bundled Traefik disabled. About **$25/month**
  (VM $24 + 10 GB Block Storage $1). Issue #1's constraint 7 (≈ £5/month) is knowingly exceeded —
  see *Open items*.
- **GitOps:** Argo CD v3.5.3 syncs `mediasafe-gitops/apps/` (app-of-apps, one `Application` per
  file, automated + prune + selfHeal). A commit is the only way the cluster changes.
- **Edge:** Traefik v3.7.13 implementing Gateway API v1.6.1; one Gateway `gateway/public`;
  cert-manager v1.21.2 issuing Let's Encrypt (HTTP-01) certs for `mediasafe.space`,
  `staging.mediasafe.space`, `argocd.mediasafe.space`. HTTP → HTTPS 301.
- **Secrets:** Vault 2.1.1 in-cluster (Raft, data on the Block Storage volume, port-forward only,
  plain HTTP inside the cluster, manual unseal with a 1-of-1 key). External Secrets 2.11.0 copies
  Vault values into Kubernetes Secrets per namespace. Bitwarden is the root of trust.
- **Database:** stays on **Neon** (unchanged). App runs as a container from GHCR.
- **App plan (stage 6):** `mediasafe-staging` (1 replica) and `mediasafe-prod` (2 replicas), each
  with its own Valkey for the shared Next.js cache, a PreSync migration Job, and a nightly sweep
  CronJob.

---

## 3. What has been done

### Stage 0 — app ready for containers ✅ (MediaSafe `cf9039b`, `835f9f6`)
- `Dockerfile`: 3-stage `node:22-bookworm-slim`, installs npm 11 (Node 22's npm 10 can't read the
  lock), standalone server as uid 1001, Sentry DSN/org/project as build args, `SENTRY_AUTH_TOKEN`
  as a BuildKit secret, `SENTRY_RELEASE` arg, migration runner bundled by esbuild to
  `dist/migrate.mjs` next to `drizzle/`.
- `cache-handler.mjs`: Next.js `cacheHandler` on Valkey (entries + per-tag bust timestamps), wired
  in `next.config.ts` for every build where `VERCEL` is unset, `cacheMaxMemorySize: 0`. A
  stale-while-revalidate bust is a **miss** (library reads have no `revalidate`); Valkey down = a
  reported miss; entries capped at 24 h.
- `tests/cache-handler.test.ts`: two handlers on one real Valkey (docker compose locally, service
  container in CI, `npm run test:cache`).
- `.env.example` / `provision.sh` gained `VALKEY_URL`, `CRON_SECRET`, `SENTRY_ENVIRONMENT`.
- Probes will hit **`/sign-in`** (no new route: constraint 5 forbids unauthenticated routes);
  verified it returns 200 with the database unreachable.

### Stage 1 — image pipeline ✅ written, ⏳ unverified (`6c68661`)
- `.github/workflows/image.yml`: on push to `main`, builds `linux/amd64`, pushes
  `ghcr.io/joyaroin/mediasafe:<sha>` (only tag), no provenance/SBOM, keeps newest 10 versions.
- **Runs for the first time when the big PR merges.** Verified locally only (amd64 build runs).
- No Sentry Actions variables/secrets exist yet, so images build without Sentry (optional).

### Stage 2 — the node ✅ applied 2026-10-01 (`a95b4f6` … `42be9ab`)
- Terraform: VM, Cloud Firewall (80/443 open; 22/6443 from the laptop's current IP only), 10 GB
  encrypted Block Storage volume (`prevent_destroy`), 3 unproxied Cloudflare A records.
- cloud-init mounts the volume at `/mnt/vault-data` **formatting only if blank** (tested on loop
  devices), then installs k3s; any cloud-init change **replaces the VM** by design.
- Verified: R2 state locking blocks a concurrent plan; the API cert covers the public IP.

### Stage 3 — GitOps bootstrap ✅ (gitops `105b4f9` … `f1d8c48`)
- `bootstrap/install` (stateless; replaces the ADR's original Terraform idea), read-only deploy key
  in Bitwarden + GitHub, root Application.
- Verified: commit reaches cluster in ≤ 4 min (polling, no webhook), hand edit reverted in 2 s,
  deleting an app prunes it. Argo never deletes a namespace it only auto-created.

### Stage 4 — ingress and TLS ✅ (gitops `69759ba` … `cf10da5`)
- Sync waves −3 Gateway API CRDs → −2 Traefik, cert-manager → −1 edge → 0 rest, with an
  Application health check in Argo's config so waves wait for **Healthy**.
- Traefik `externalTrafficPolicy: Local` (real client IP reaches the app — Better Auth's rate
  limit needs it). Traefik's 25 unused CRDs skipped and hand-deleted once (they were untracked).
- Verified from the internet: 301 redirect, trusted prod certs, real client IP; apex 404 (no app).

### Stage 5 — Vault, External Secrets, public Argo CD ✅ (5a–5e, done 2026-10-10)
- **5a ✅** (gitops `30e4f5f`, `aef68b7`): Vault 2.1.1 via chart 0.34.1, standalone + Raft, local
  PV `vault-data` → `/mnt/vault-data/raft` (Retain, Prune=false, claimRef `data-vault-0`), init
  container chowns to 100:1000. `enable_unauthenticated_access = ["generate-root"]` because Vault
  2.0 made generate-root authenticated and the recovery plan needs it. Initialised by
  `bootstrap/vault-init` (1-of-1); unseal key and root token in Bitwarden only.
- **5b ✅** (MediaSafe `a1c4b60` … `16ac9ef`): `infra/vault` applied with the root token: KV v2 at
  `kv/`, policies `mediasafe-{staging,prod}-read`, `argocd-read`, `vault-snapshot`, `admin`;
  Kubernetes auth roles `eso-mediasafe-staging`, `eso-mediasafe-prod`, `eso-argocd`,
  `vault-snapshot` (each bound to one SA in one namespace, audience `vault`, 1 h tokens); Google
  OIDC login bound to `adhamseddik546@gmail.com` → `admin` (8 h tokens). The Google client secret
  is **write-only** (`oidc_client_secret_wo`, ephemeral variable): not in state or plans.
  Verified: `./tf plan` with the Google login → *No changes*.
- **5c ✅** (gitops `087b8d8`, `a545d36`): External Secrets 2.11.0 with **no cluster-scoped kinds**
  (ClusterSecretStore/ClusterExternalSecret/PushSecret CRDs not installed). `app-namespaces` app
  creates `mediasafe-staging` and `mediasafe-prod`, each with SA `vault-reader` and SecretStore
  `vault`. Verified: each env read its own test value; staging reading prod's path got
  **403 permission denied** from Vault. Test values and app removed.
- **5d ✅** (MediaSafe `14250c6`, gitops `e7d4771`): R2 bucket `mediasafe-vault-snapshots` in
  `infra/terraform` (lifecycle: objects 14 days, abandoned multipart 7 days; the API stores
  `maxAge` in seconds). CronJob `vault/vault-snapshot` at 03:00 UTC: init container
  `hashicorp/vault:2.1.1` logs in as `vault-snapshot` with a projected token (audience `vault`),
  saves the snapshot and reads `kv/infra/vault-snapshots` into an in-memory emptyDir;
  `rclone/rclone:1.75.1` uploads it. **`bootstrap/vault-restore-drill` passed 2026-10-10**
  (restore into a throwaway Vault, original unseal key, `generate-root` from the key alone,
  canary read back). The drill is also the restore procedure.
- **5e ✅** (gitops `8fae650`, `d161b68`): Argo CD at `https://argocd.mediasafe.space`, Google
  sign-in only. App `argocd-public` (`platform/argocd-public/`): SA `vault-reader` + SecretStore
  (role `eso-argocd`) + ExternalSecret → Secret `argocd-google-oidc` (label
  `app.kubernetes.io/part-of: argocd`) from `kv/infra/argocd/google-oidc`, and the HTTPRoute.
  Kept out of `apps/argocd.yaml` so a sealed Vault degrades only this app and `bootstrap/install`
  stays Vault-free. Same Google client as Vault's admin login. RBAC: `policy.default` empty,
  `g, adhamseddik546@gmail.com, role:admin`, `scopes: [email]`. Verified: Google sign-in shows
  all apps; `admin.enabled: false` (server logs `admin disabled`);
  `argocd-initial-admin-secret` deleted. **Vault root token revoked**: lookup now 403s,
  `generate-root -status` answers without a token, the Google admin login still works.

---

## 4. Current live state (2026-10-10)

- Argo apps, all **Synced/Healthy**: `root`, `argocd`, `argocd-public`, `gateway-api-crds`,
  `traefik`, `cert-manager`, `edge`, `vault`, `external-secrets`, `app-namespaces`.
- Argo CD public at `https://argocd.mediasafe.space`, Google sign-in only, no local admin.
- Vault: initialised, **unsealed**, v2.1.1, **no root token**. KV holds `kv/infra/vault-snapshots`
  (the R2 key) and `kv/infra/argocd/google-oidc`.
- R2 bucket `mediasafe-vault-snapshots`; first scheduled snapshot 2026-10-11 03:00 UTC.
- Node memory: ~2.0 GiB working set of 3.9 GiB; **~1.83 GiB available** (after 5e). `k3s-server`
  ~1.09 GiB as of 5c (grew ~220 MiB with External Secrets' 20 CRDs, 18 unused generators).
- Cert expiry: all three 2026-12-31; cert-manager renews ~30 days before.

### Verify the current state

```sh
export KUBECONFIG=~/.kube/mediasafe.yaml           # REQUIRED: ~/.kube/config points at a dead EKS cluster
kubectl -n argocd get applications
kubectl -n vault exec vault-0 -c vault -- vault status
kubectl top node
git -C ~/MediaSafe log --oneline main..infra-migration
git -C ~/mediasafe-gitops log --oneline -5
```

---

## 5. Secrets inventory (names only)

**Bitwarden** (login items unless noted; `./tf` and the bootstrap scripts read them by exact name):

| Item | Holds | Used by |
|---|---|---|
| `mediasafe/linode-token` | password = Linode PAT (Linodes, Volumes, Firewalls RW) | `infra/terraform/tf` |
| `mediasafe/cloudflare-token` | password = API token (Zone DNS Edit + Account R2 Edit) | `infra/terraform/tf` |
| `mediasafe/r2-terraform-state` | username = access key id, password = secret (state bucket only) | both `./tf` |
| `mediasafe/argocd-deploy-key` | secure note = SSH private key (read-only deploy key) | `bootstrap/install` |
| `mediasafe/vault-unseal-key` | password = unseal key — **permanent, also keep offline** | `bootstrap/vault-unseal` |
| `mediasafe/vault-root-token` | ~~initial root token~~ **revoked 2026-10-10**; item to be deleted (in Trash 30 days) | nothing |
| `mediasafe/r2-vault-snapshots` | username = access key id, password = secret (Object RW, snapshot bucket only) | copied into `kv/infra/vault-snapshots`; `bootstrap/vault-restore-drill` |
| `mediasafe/google-admin-oauth` | username = client id, password = secret ("MediaSafe admin", own GCP project, Testing mode) | `infra/vault/tf`, 5e |

**Vault paths:** `kv/infra/vault-snapshots` (R2 key for backups) and
`kv/infra/argocd/google-oidc` (Argo's Google client) are set; `kv/mediasafe/{staging,prod}/*`
(app env) are planned for stage 6. No root token exists: if the Google login breaks, mint one
with `vault operator generate-root` and the unseal key (proved by the restore drill).

---

## 6. Runbook — the commands used every session

```sh
# Every terminal
export KUBECONFIG=~/.kube/mediasafe.yaml
export BW_SESSION="$(bw unlock --raw)"     # each unlock invalidates other terminals' sessions

# Vault sealed (after any Vault restart / VM reboot / k3s upgrade)
~/mediasafe-gitops/bootstrap/vault-unseal

# Vault as admin
kubectl -n vault port-forward svc/vault 8200:8200 &
export VAULT_ADDR=http://127.0.0.1:8200
vault login -method=oidc                    # Google; token in ~/.vault-token for 8 h

# Terraform
cd ~/MediaSafe/infra/terraform && ./tf plan         # VM, firewall, DNS
cd ~/MediaSafe/infra/vault && ./tf plan             # Vault config (uses ~/.vault-token)

# Argo UI: https://argocd.mediasafe.space (Google). If sign-in is broken:
argocd --core app list
```

The Vault CLI is `~/.local/bin/vault` (2.1.1, installed from HashiCorp's release with a verified
SHA-256) because Homebrew is blocked by outdated Xcode Command Line Tools.

---

## 7. Lessons that cost time (don't relearn them)

1. `bw` reads a cached vault — new items are "Not found." until `bw sync` (`./tf` now syncs).
2. A second `bw unlock` stales the first terminal's `BW_SESSION` (`./tf` detects it).
3. A plain `terraform apply` with no changes never holds the state lock; test locking with a
   pending change (`-var vault_volume_size=11`, then answer `no`).
4. Shell redirection truncates the target before the command runs: a failed
   `./tf state pull > file` leaves a 0-byte backup.
5. `~/.kube/config` points at an old EKS cluster; without `KUBECONFIG` kubectl targets it.
   `bootstrap/install` and `infra/vault/tf` now refuse any cluster without node `mediasafe`.
6. Argo sync waves only order *creation* unless Applications have a health check (added).
7. `skipCrds` stops Argo rendering CRDs but doesn't prune ones it never tracked.
8. Argo won't delete a namespace created by `CreateNamespace=true`; track it as a manifest.
9. Vault 2.0 authenticates `sys/generate-root` by default (re-enabled for recovery).
10. Copying aligned commands with trailing `# comments` into zsh broke them; give bare commands.

---

## 8. What comes next — in order

### Stage 6 — the app on staging (then prod values, still suspended)
**Decision needed first:** stage 1's workflow only runs on `main`, so **no image exists in GHCR
until the big PR merges** (merging also deploys to Vercel prod, which should be harmless — the
Valkey handler is off on Vercel). Either merge the PR before stage 6, or push one image by hand
(`docker buildx build --platform linux/amd64 … --push` with a `write:packages` token).

Then:
- **Neon:** confirm the project's region (us-iad is right only for `aws-us-east-1`); create the
  staging branch seeded from `fixtures/mediasafe-seed.json`; use **pooled** (`-pooler`) URLs.
- **Vault values** per env under `kv/mediasafe/<env>/app`: `DATABASE_URL`, `BETTER_AUTH_SECRET`
  (prod = reuse Vercel's or every user is signed out; staging = new), `GOOGLE_CLIENT_ID/SECRET`,
  `TMDB_READ_ACCESS_TOKEN`, `CRON_SECRET` (new per env), `SENTRY_DSN`. GHCR pull token (classic
  PAT, `read:packages`) under `kv/mediasafe/<env>/ghcr` → ExternalSecret `dockerconfigjson`.
- **Chart** `mediasafe-gitops/charts/mediasafe` + `values-staging.yaml` / `values-prod.yaml`:
  Deployment (probes on `/sign-in`, `envFrom` the synced Secret, `SENTRY_ENVIRONMENT`,
  `VALKEY_URL`), Service, HTTPRoute (`staging.` / apex), PreSync Job `node dist/migrate.mjs`,
  sweep CronJob (curl the Service with `Bearer $CRON_SECRET`; staging 07:00, prod 09:00 UTC, prod
  **suspended**), Valkey Deployment + Service (no volume), ExternalSecrets.
- `apps/mediasafe-staging.yaml`, later `apps/mediasafe-prod.yaml`.
- **CI:** extend `image.yml` to commit the new tag into `values-staging.yaml` (fine-grained PAT,
  Contents RW on `mediasafe-gitops` only, as an Actions secret); add a `workflow_dispatch` that
  copies the staging tag to prod.
- Google OAuth (the **app's** client): add `https://staging.mediasafe.space/api/auth/callback/google`
  (and the apex one at cutover).
- **Recommended addition:** nightly `pg_dump` of Neon to R2 — Neon's 6-hour history is currently
  the only backup.
- Done when: merge to `main` deploys staging, sign-in works there, one sweep has run.

### Stages 7–10 (from the ADR)
- **7 NetworkPolicies:** default-deny per namespace; allow gateway → app, app → Valkey,
  ESO → Vault, Vault snapshot → R2, egress to Neon/TMDB/Google/Sentry. Also restrict the Gateway's
  HTTPS listeners' `allowedRoutes` (today `from: All`, so any namespace could claim any hostname).
- **8 Prod beside Vercel:** prod values + secrets, promotion workflow; **freeze merges to `main`**
  until 9 is done (two migrators on one Neon DB).
- **9 Cutover:** OAuth redirect + `BETTER_AUTH_URL`, turn off Vercel git deploys and cron,
  unsuspend the prod CronJob.
- **10 Cleanup:** delete Vercel project, `vercel.json`, the `VERCEL`/`VERCEL_ENV` branches in
  `scripts/build.ts` and `next.config.ts`; update README and `CLAUDE.md`; mark the ADR implemented.

---

## 9. Open items and loose ends

- **Issue #1 constraint 7** still says ≈ £5/month; the real cost is ≈ $25. Not edited yet
  (Adham to decide who updates it).
- **Memory headroom ~1.66 GiB** before stage 6 (~800 MiB needed). Option if tight: install only
  ESO's 2 used CRDs (riskier than Traefik's case — the controller may expect generator CRDs).
- **Xcode Command Line Tools** outdated (26.6 vs 27) — blocks all `brew install`.
- Add `export KUBECONFIG=~/.kube/mediasafe.yaml` to `~/.zshrc` (Adham's file).
- `ci.yml` uses `actions/checkout@v4` (deprecated Node 20); `image.yml` uses v7.
- Sentry Actions variables/secret unset (images build without Sentry until set).
- Optional: GitHub webhook → Argo (`argocd.mediasafe.space/api/webhook`) for instant syncs.
- `mediasafe/vault-root-token` deletion from Bitwarden: confirm it is done.
- Cluster-map artifact is a 4 Oct snapshot (pre-Vault/ESO/public Argo).
- Nothing alerts on a failed snapshot Job (a sealed Vault fails it every night). Plan: a Sentry
  cron monitor check-in from the CronJob.
