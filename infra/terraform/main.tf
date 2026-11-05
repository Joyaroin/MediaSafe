locals {
  name = "mediasafe"
}

# ── DNS ──────────────────────────────────────────────────────────────────────────────────
#
# Every name is a proxied CNAME to the home cluster's tunnel, below.
data "cloudflare_zone" "site" {
  filter = {
    name = var.domain
  }
}

locals {
  hostnames = {
    apex    = var.domain
    staging = "staging.${var.domain}"
    argocd  = "argocd.${var.domain}"
    lab     = "lab.${var.domain}" # the portfolio, deployed from Forgejo
  }
}

resource "cloudflare_dns_record" "site" {
  for_each = local.hostnames

  zone_id = data.cloudflare_zone.site.zone_id
  name    = each.value
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.home.id}.cfargotunnel.com"
  ttl     = 1 # "automatic", the only TTL a proxied record takes
  proxied = true
  comment = "MediaSafe infra/terraform"
}

moved {
  from = cloudflare_dns_record.lab
  to   = cloudflare_dns_record.site["lab"]
}

# Cloudflare's edge is the only place a plain-HTTP request can be turned away: the cluster has
# no HTTP listener at all (morioh-cho-gitops, platform/edge/gateway.yaml).
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

# The portfolio's hashed assets never change, and .glb isn't an extension Cloudflare caches by
# default. Caching them here keeps its 3D room off the home connection.
resource "cloudflare_ruleset" "cache" {
  zone_id = data.cloudflare_zone.site.zone_id
  name    = "Cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [{
    description = "lab: hashed assets"
    expression  = "(http.host eq \"lab.${var.domain}\" and starts_with(http.request.uri.path, \"/assets/\"))"
    action      = "set_cache_settings"
    action_parameters = {
      cache = true
      edge_ttl = {
        mode = "respect_origin"
      }
    }
  }]
}

# ── The tunnel to the home cluster ───────────────────────────────────────────────────────
#
# cloudflared runs inside the home cluster (morioh-cho-gitops, platform/cloudflared) and dials
# out to Cloudflare, so the home network opens no ports. Its routes live here: every hostname
# goes to Traefik's HTTPS port with that hostname as SNI, so Traefik picks the Gateway listener
# and certificate exactly as for a direct visitor, and cloudflared checks that certificate.
#
# No tunnel_secret is set, so Cloudflare generates it and it never reaches this state. The
# connector's token is copied from Cloudflare's API into Vault at kv/infra/cloudflared/tunnel
# by hand (README.md); deliberately not through the token data source, which would store it here.
resource "cloudflare_zero_trust_tunnel_cloudflared" "home" {
  account_id = var.cloudflare_account_id
  name       = "${local.name}-home"
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "home" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.home.id

  config = {
    ingress = concat(
      [for hostname in values(local.hostnames) : {
        hostname       = hostname
        service        = "https://traefik.traefik.svc.cluster.local:443"
        origin_request = { origin_server_name = hostname }
      }],
      # Anything else that reaches the tunnel, e.g. a hostname added here before the Gateway.
      [{ service = "http_status:404" }],
    )
  }
}

# ── Vault's snapshots ────────────────────────────────────────────────────────────────────
#
# A nightly CronJob in the cluster (morioh-cho-gitops, platform/vault) uploads a Raft snapshot
# here. Snapshots are encrypted by Vault's own keyring, so they are useless without the unseal
# key in Bitwarden. Fourteen nights are kept; a snapshot older than that is not worth restoring.
#
# The CronJob's R2 key is created by hand after this bucket exists, scoped to it alone, and
# lives in Vault at kv/infra/vault-snapshots — never in this state.
resource "cloudflare_r2_bucket" "vault_snapshots" {
  account_id = var.cloudflare_account_id
  name       = "${local.name}-vault-snapshots"
  location   = "enam" # Eastern North America, near the home cluster. Honoured only at creation.
}

resource "cloudflare_r2_bucket_lifecycle" "vault_snapshots" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.vault_snapshots.name

  rules = [
    {
      id         = "expire-after-14-days"
      enabled    = true
      conditions = { prefix = "" }
      # Seconds. The provider doesn't document the unit; Cloudflare's API does.
      delete_objects_transition = {
        condition = { type = "Age", max_age = 14 * 86400 }
      }
      # Replaces the default rule R2 puts on a new bucket, which this resource would otherwise drop.
      abort_multipart_uploads_transition = {
        condition = { type = "Age", max_age = 7 * 86400 }
      }
    },
  ]
}
