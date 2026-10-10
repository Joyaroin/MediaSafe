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
| App repo | `~/MediaSafe`, branch **`infra-migration`**, ahead of `main` (`git log main..infra-migration`), pushed to GitHub. Everything ships as **one big PR** (Adham's choice); the temporary `infra-migration` image trigger is already removed. |
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

### Stage 1 — image pipeline ✅ verified 2026-10-10 (`6c68661`)
- `.github/workflows/image.yml`: on push to `main`, builds `linux/amd64`, pushes
  `ghcr.io/joyaroin/mediasafe:<sha>` (only tag), no provenance/SBOM, keeps newest 10 versions.
- First CI run 2026-10-10 from `infra-migration` (temporary trigger, see section 1): built and
  pushed `875187118c…`, which staging pulled with the `read:packages` token.
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

### Stage 6 — staging ✅ (2026-10-10)
- gitops `77de0b0`: chart `charts/mediasafe` + `values-staging.yaml`, app `mediasafe-staging`.
  Waves: ExternalSecrets `mediasafe-app` (dataFrom `kv/mediasafe/staging/app`) and `ghcr-pull`
  (dockerconfigjson) + Valkey at −1 → migration Job as a **Sync hook** at 0 (not PreSync: PreSync
  runs before wave −1, so the Secret wouldn't exist) → Deployment, Service, HTTPRoute, sweep
  CronJob at 1. Valkey `8.1.10-alpine`, **noeviction** (any LRU policy could evict a tag-bust
  timestamp while its entry survives → silent stale hit). App and jobs run read-only-rootfs.
- Neon staging branch `ep-dry-resonance-axrzmo26` (us-east-2, pooled). It was created
  schema-only, so it was emptied before the first migration (a schema-only branch copies the
  tables but not drizzle's history → `relation already exists`).
- Verified: migration 5 s; `/sign-in` 200 over TLS; sweep endpoint 401 without the secret; a
  manual sweep Job returned `{"candidates":0,…}`; app 95 Mi, Valkey 8 Mi, node ~1.72 GiB free.
- Vault `kv/mediasafe/staging/app`: `SENTRY_DSN` deliberately empty (Sentry off on staging).
- CI (MediaSafe `a760d34`): `image.yml` job `deploy-staging` commits each new SHA to
  `values-staging.yaml` with `GITOPS_TOKEN` (fine-grained, Contents RW on mediasafe-gitops only,
  an Actions secret **on MediaSafe**). Verified: one push → build → `Deploy MediaSafe a760d34 to
  staging` commit → Argo migrated and rolled staging. `promote.yml` (manual) copies staging's SHA
  to `values-prod.yaml`.

### Stage 8 — prod on k3s beside Vercel ✅ (gitops `4d3c5e0`, 2026-10-10)
- `apps/mediasafe-prod.yaml` + `values-prod.yaml`: `mediasafe.space` on `https-apex`, 2 replicas,
  sweep **suspended** (Vercel Cron still runs it), image `a760d34` (= staging).
- Vault `kv/mediasafe/prod/app`: own `BETTER_AUTH_SECRET` and `CRON_SECRET`; Google client ID and
  secret, TMDB and the GHCR token copied from staging inside Vault; `DATABASE_URL` = Neon main,
  pooled (`ep-morning-haze-axmzr7od`). **`SENTRY_DSN` empty: set it before the cutover**, or prod's
  error screens have no reference id (AGENTS.md).
- Google: the app client (`335937872978-8kpao8r7…`) has the staging and apex callbacks; its two
  secrets are Vercel's and the one staging/prod share (only the latter is stored, in Vault).
- Neon restore point: branch `pre-k3s-2026-10-10` from main (Adham, not verified from here).
- Verified: migration `[migrate] up to date`; 2 replicas ~94 Mi each, node ~1.6 GiB free; sign-in
  on `mediasafe.space` shows Adham's real library.
- **Merge freeze on MediaSafe `main` is in effect** until the cutover: Vercel's build migrates on
  every merge, and so does k3s prod on promotion, against the same database.

### Stage 7 — NetworkPolicies ✅ (gitops `5ef2c3c`, `335b4c6`, 2026-10-10)
- k3s enforces policy with its embedded kube-router (not disabled in `config.yaml`).
- **App namespaces** (in the chart, so prod gets them too): default-deny ingress+egress; DNS to
  CoreDNS; Traefik → app 3000; sweep → app 3000; app → Valkey 6379; app and migrate → internet
  443 (`0.0.0.0/0` minus 10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16).
- **Vault:** ingress only, from `external-secrets` and the `vault` namespace. Egress left open:
  the API server is on the node's public IP, and pinning it would break on a VM rebuild.
- **Gateway:** `http` accepts routes from `Same` (the redirect and cert-manager's challenge
  routes live in `gateway`); each HTTPS listener only from its own namespace.
- Verified: site, Argo, probes, migrate, sweep, ESO refresh, snapshot all work; app → Vault,
  app → Argo, other pods → Valkey/app/Vault all **blocked**; app → internet 443 and → Valkey
  open; an HTTPRoute in `default` claiming `staging.` → `NotAllowedByListeners`; a forced
  renewal of the Argo cert succeeded under `from: Same` (new cert to 2027-01-08).

---

## 4. Current live state (2026-10-10)

- Argo apps, all **Synced/Healthy**: `root`, `argocd`, `argocd-public`, `gateway-api-crds`,
  `traefik`, `cert-manager`, `edge`, `vault`, `external-secrets`, `app-namespaces`,
  `mediasafe-staging`, `mediasafe-prod`.
- Staging at `https://staging.mediasafe.space`, prod at `https://mediasafe.space` (beside Vercel,
  same Neon main); Google sign-in works on both; NetworkPolicies on.
- Argo CD public at `https://argocd.mediasafe.space`, Google sign-in only, no local admin.
- Vault: initialised, **unsealed**, v2.1.1, **no root token**. KV holds `kv/infra/vault-snapshots`
  (the R2 key) and `kv/infra/argocd/google-oidc`.
- R2 bucket `mediasafe-vault-snapshots`; first scheduled snapshot 2026-10-11 03:00 UTC.
- Node memory: ~2.0 GiB working set of 3.9 GiB; **~1.83 GiB available** (after 5e). `k3s-server`
  ~1.09 GiB as of 5c (grew ~220 MiB with External Secrets' 20 CRDs, 18 unused generators).
- Cert expiry: apex and staging 2026-12-31, argocd 2027-01-08 (renewal test); cert-manager renews ~30 days before.

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
11. k3s's kube-router applies NetworkPolicy to a new pod ~1 s after it starts; until then its
    connections are refused. Every Job waits for its network first (sweep, migrate, snapshot).
12. A Neon **schema-only** branch copies tables but not drizzle's history: empty it before the
    first migration or it fails with `relation … already exists`.
13. Example commands with `<placeholders>` got pasted literally into Vault. Prompt with
    `read -rs` and pipe to `vault kv patch … KEY=-` instead.

---

## 8. What comes next — in order

### Neon backup (recommended before the cutover)
Nightly `pg_dump` of Neon main to R2: Neon's 6-hour history is the only backup.

### Stage 9 — cutover ✅ (2026-10-10)
- Vercel cron disabled (Adham) + prod sweep unsuspended (gitops `48be8e2`): first k3s prod sweep
  2026-10-11 09:00 UTC — check `kubectl -n mediasafe-prod get jobs` after.
- Vercel git disconnected (Adham): no Vercel build on merge → the **merge freeze is over**.

### Stage 10 — cleanup 🔄
- Code (in the migration PR): see the ADR's rollout entry 10. Typecheck, lint, build and the
  route-manifest test pass locally; the cache test needs Docker (CI runs it).
- Neon is **not** Vercel-managed (checked by Adham 2026-10-10: no store or integration in the
  Vercel project), so deleting the project can't touch the database. Adham: delete it, then disable the
  Google client secret Vercel used and its redirect URI; `rm -r ~/MediaSafe/.vercel`.
- Not done, on purpose: ~20 comments in app code that explain past choices by Vercel limits
  (still true history); `scripts/provision.sh`'s Vercel steps and `.env.example` (deny rule) —
  both describe Vercel setup and need a pass by Adham.
- Refresh the cluster-map artifact.

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
