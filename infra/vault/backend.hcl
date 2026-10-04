# The same R2 bucket and settings as infra/terraform/backend.hcl, under its own key.

bucket = "mediasafe-tfstate"
key    = "vault/terraform.tfstate"
region = "auto"

endpoints = {
  s3 = "https://e611254754d8c1922b8ead788aab6f40.r2.cloudflarestorage.com"
}

skip_credentials_validation = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_s3_checksum            = true
use_path_style              = true
use_lockfile                = true
