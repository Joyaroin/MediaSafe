# Vault's configuration: where secrets live, who may read which, and how people and pods log in.
# Secret *values* are never here — they go in by hand with `vault kv put` (ADR 0001), so they
# never reach this state or git.

# ── Secrets ──────────────────────────────────────────────────────────────────────────────
#
#   kv/mediasafe/staging/*   the staging app's environment
#   kv/mediasafe/prod/*      the production app's environment
#   kv/infra/argocd/*        Argo CD's Google sign-in secret
#   kv/infra/vault-snapshots the R2 key the nightly snapshot uploads with
resource "vault_mount" "kv" {
  path        = "kv"
  type        = "kv"
  options     = { version = "2" }
  description = "MediaSafe secrets. Values are written by hand, never by Terraform."
}

# ── Policies ─────────────────────────────────────────────────────────────────────────────

locals {
  app_environments = ["staging", "prod"]
}

resource "vault_policy" "app_read" {
  for_each = toset(local.app_environments)
  name     = "mediasafe-${each.key}-read"
  policy   = <<-EOT
    # This environment's app secrets, and nothing else. Staging cannot read prod.
    path "${vault_mount.kv.path}/data/mediasafe/${each.key}/*" {
      capabilities = ["read"]
    }
    path "${vault_mount.kv.path}/metadata/mediasafe/${each.key}/*" {
      capabilities = ["read", "list"]
    }
  EOT
}

resource "vault_policy" "argocd_read" {
  name   = "argocd-read"
  policy = <<-EOT
    path "${vault_mount.kv.path}/data/infra/argocd/*" {
      capabilities = ["read"]
    }
  EOT
}

resource "vault_policy" "snapshot" {
  name   = "vault-snapshot"
  policy = <<-EOT
    # Take a Raft snapshot, and read the R2 key to upload it with.
    path "sys/storage/raft/snapshot" {
      capabilities = ["read"]
    }
    path "${vault_mount.kv.path}/data/infra/vault-snapshots" {
      capabilities = ["read"]
    }
  EOT
}

# Everything. Held only by the one Google account below, and needed to run this stack.
resource "vault_policy" "admin" {
  name   = "admin"
  policy = <<-EOT
    path "*" {
      capabilities = ["create", "read", "update", "patch", "delete", "list", "sudo"]
    }
  EOT
}

# ── Pods log in with their Kubernetes service account ────────────────────────────────────
#
# Vault runs in the cluster, so it verifies service-account tokens against the API server with
# its own (the chart grants it system:auth-delegator). Each role trusts exactly one service
# account in exactly one namespace, and only tokens minted for the audience "vault".
resource "vault_auth_backend" "kubernetes" {
  type        = "kubernetes"
  path        = "kubernetes"
  description = "Service-account login for pods: External Secrets and the snapshot CronJob."
}

resource "vault_kubernetes_auth_backend_config" "in_cluster" {
  backend         = vault_auth_backend.kubernetes.path
  kubernetes_host = "https://kubernetes.default.svc"
}

locals {
  kubernetes_roles = {
    "eso-mediasafe-staging" = {
      namespace = "mediasafe-staging"
      account   = "vault-reader"
      policies  = [vault_policy.app_read["staging"].name]
    }
    "eso-mediasafe-prod" = {
      namespace = "mediasafe-prod"
      account   = "vault-reader"
      policies  = [vault_policy.app_read["prod"].name]
    }
    "eso-argocd" = {
      namespace = "argocd"
      account   = "vault-reader"
      policies  = [vault_policy.argocd_read.name]
    }
    "vault-snapshot" = {
      namespace = "vault"
      account   = "vault-snapshot"
      policies  = [vault_policy.snapshot.name]
    }
  }
}

resource "vault_kubernetes_auth_backend_role" "this" {
  for_each = local.kubernetes_roles

  backend                          = vault_auth_backend.kubernetes.path
  role_name                        = each.key
  bound_service_account_names      = [each.value.account]
  bound_service_account_namespaces = [each.value.namespace]
  audience                         = "vault"
  token_policies                   = each.value.policies
  token_ttl                        = 3600
  token_max_ttl                    = 3600
}

# ── People log in with Google ────────────────────────────────────────────────────────────
#
# One account, the admin policy, 8-hour tokens. The redirect URIs are Vault's CLI callback and
# the UI through port-forward; the same URIs are registered on the Google client.
resource "vault_jwt_auth_backend" "google" {
  path               = "oidc"
  type               = "oidc"
  description        = "Google sign-in for the admin."
  oidc_discovery_url = "https://accounts.google.com"
  oidc_client_id     = var.google_admin_client_id
  default_role       = "admin"

  # Write-only: sent to Vault, never stored in this stack's state or plan. To rotate the secret,
  # update it in Bitwarden and increment the version — the only way Terraform knows to resend it.
  oidc_client_secret_wo         = var.google_admin_client_secret
  oidc_client_secret_wo_version = 1

  tune {
    # Offer it on the UI's sign-in page.
    listing_visibility = "unauth"
  }
}

resource "vault_jwt_auth_backend_role" "admin" {
  backend   = vault_jwt_auth_backend.google.path
  role_name = "admin"
  role_type = "oidc"

  user_claim   = "email"
  bound_claims = { email = var.admin_email }
  oidc_scopes  = ["openid", "email"]

  allowed_redirect_uris = [
    "http://localhost:8250/oidc/callback",
    "http://127.0.0.1:8200/ui/vault/auth/oidc/oidc/callback",
    "http://localhost:8200/ui/vault/auth/oidc/oidc/callback",
  ]

  token_policies = [vault_policy.admin.name]
  token_ttl      = 28800
  token_max_ttl  = 28800
}
