# infra/vault — Vault's configuration

Stage 5b of [ADR 0001](../../docs/adr/0001-deploy-to-k3s-on-linode-with-gitops.md). Vault itself is
installed by Argo CD (`mediasafe-gitops/apps/vault.yaml`); this directory configures what is inside
it: the KV store, the policies, the Kubernetes roles pods log in with, and Google sign-in for you.

Secret **values** are not here. They go in by hand (`vault kv put`), so they never reach state or git.

## One-time setup

1. **A Google OAuth client for admin sign-in**, in its **own** Google Cloud project (e.g.
   `mediasafe-admin`). It must not share a project with the app's sign-in client: the consent
   screen's Testing mode, which limits sign-in to listed test users, is per project, and the app's
   project has to be in Production for anyone to use the app.
   - OAuth consent screen: External, **Testing**, test user `adhamseddik546@gmail.com`, scopes
     `openid` and `email`.
   - Credentials → Create OAuth client ID → *Web application*, name `MediaSafe admin`, with these
     authorized redirect URIs:

     ```
     http://localhost:8250/oidc/callback
     http://127.0.0.1:8200/ui/vault/auth/oidc/oidc/callback
     http://localhost:8200/ui/vault/auth/oidc/oidc/callback
     https://argocd.mediasafe.space/auth/callback
     http://localhost:8085/auth/callback
     ```

     The first three are Vault (CLI, and the UI through port-forward); the last two are Argo CD (web,
     and `argocd login --sso`), used in stage 5e.
   - Store it in Bitwarden as the login item `mediasafe/google-admin-oauth`: client ID as the
     username, client secret as the password.
2. **The Vault CLI:** `brew install hashicorp/tap/vault`.

## First apply — with the root token

```sh
export BW_SESSION="$(bw unlock --raw)"
export KUBECONFIG=~/.kube/mediasafe.yaml
./tf init
./tf --root plan
./tf --root apply
```

`./tf` opens a port-forward to Vault for the length of the command. `--root` uses
`mediasafe/vault-root-token` from Bitwarden — the only identity Vault has until this apply creates
Google sign-in.

## From then on — with your Google login

```sh
kubectl -n vault port-forward svc/vault 8200:8200 &
export VAULT_ADDR=http://127.0.0.1:8200
vault login -method=oidc          # opens Google in the browser; token saved to ~/.vault-token
./tf plan                         # "No changes" proves the Google token can run this stack
```

Once that works, the root token is revoked (stage 5e). If Google sign-in ever breaks after that,
`vault operator generate-root` makes a new root token from the unseal key — Vault 2.x allows it
only because `platform/vault/values.yaml` sets `enable_unauthenticated_access = ["generate-root"]`.
