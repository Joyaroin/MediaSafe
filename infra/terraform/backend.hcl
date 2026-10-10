# Terraform state in Cloudflare R2, through the S3 backend. Nothing here is secret: the
# account id is in every R2 URL. The bucket is created by hand (Cloudflare → R2), because
# Terraform cannot create the bucket its own state lives in.
#
# R2 has no bucket versioning, so there is no automatic state history. Keep a copy after
# each apply that changes something that matters: ./tf state pull > state-backup.json

bucket = "mediasafe-tfstate"
# No leading slash: the backend rejects keys that start or end with "/".
key    = "infra/terraform.tfstate"
region = "auto"

endpoints = {
  s3 = "https://e611254754d8c1922b8ead788aab6f40.r2.cloudflarestorage.com"
}

# R2 is S3-compatible, not AWS: none of AWS's own checks apply.
skip_credentials_validation = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_s3_checksum            = true
use_path_style              = true

# A conditional write of <key>.tflock (If-None-Match: *), which R2 supports. Nobody
# documents it on R2 specifically; the README's first-apply check tests it.
use_lockfile = true
