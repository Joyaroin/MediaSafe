terraform {
  # `use_lockfile` (S3-native state locking) is GA from 1.11.
  required_version = ">= 1.11"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.26"
    }
  }

  # Cloudflare R2, configured in backend.hcl. Credentials come from AWS_ACCESS_KEY_ID and
  # AWS_SECRET_ACCESS_KEY, which ./tf loads from Bitwarden — never from a file.
  backend "s3" {}
}

# CLOUDFLARE_API_TOKEN, from the environment ./tf sets up.
provider "cloudflare" {}
