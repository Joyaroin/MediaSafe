terraform {
  required_version = ">= 1.11"

  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 5.12"
    }
  }

  # Same R2 bucket as infra/terraform, its own key. See backend.hcl.
  backend "s3" {}
}

# Reached through `kubectl port-forward`, which ./tf opens: Vault has no public route. The token
# comes from VAULT_TOKEN — the root token on the first apply only (./tf --root), and your Google
# login's token after that.
provider "vault" {
  address = "http://127.0.0.1:8200"
}
