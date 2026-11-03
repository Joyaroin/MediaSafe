locals {
  name = "mediasafe"

  # The volume's label fixes its device path on the VM, which cloud-init waits for.
  vault_volume_label = "mediasafe-vault"
  vault_volume_path  = "/dev/disk/by-id/scsi-0Linode_Volume_mediasafe-vault"

  # Fixed, so a rebuilt VM is the same Kubernetes node by name, and the local
  # PersistentVolume that pins Vault to this node still matches it.
  node_name = "mediasafe"

  # The VM's one public IPv4 address. `one` fails loudly if a private or second address is
  # ever added, rather than picking one of them arbitrarily.
  public_ip = one(linode_instance.node.ipv4)
}

# ── The firewall ─────────────────────────────────────────────────────────────────────────
#
# Web traffic from anywhere; SSH and the Kubernetes API from the admin addresses only.
# Everything else is dropped, including the ports k3s uses between nodes, since there is
# one node.
resource "linode_firewall" "node" {
  label           = "${local.name}-node"
  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  inbound {
    label    = "web"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80, 443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "admin"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22, 6443"
    ipv4     = var.admin_cidrs
  }

  inbound {
    label    = "icmp"
    action   = "ACCEPT"
    protocol = "ICMP"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }
}

# ── The VM ───────────────────────────────────────────────────────────────────────────────
#
# **Changing cloud-init replaces this VM** — the provider treats user_data, image and
# authorized_keys as fixed at creation. That is the design, not an accident: the node is
# rebuilt from this file and the cluster from git. What must survive a rebuild lives on the
# volume below, and a plan that says "must be replaced" is the signal to read carefully.
resource "linode_instance" "node" {
  label           = "${local.name}-node"
  region          = var.region
  type            = var.instance_type
  image           = var.image
  authorized_keys = [chomp(file(pathexpand(var.ssh_public_key_path)))]
  firewall_id     = linode_firewall.node.id
  tags            = [local.name]

  metadata {
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      k3s_version       = var.k3s_version
      node_name         = local.node_name
      vault_volume_path = local.vault_volume_path
    }))
  }
}

# ── Vault's disk ─────────────────────────────────────────────────────────────────────────
#
# Outlives the VM: a replaced instance gets this volume reattached, and cloud-init mounts it
# without formatting it. It is the one piece of this file that holds data, so Terraform
# refuses to destroy it. Deleting it on purpose means removing prevent_destroy first.
resource "linode_volume" "vault" {
  label     = local.vault_volume_label
  region    = var.region
  size      = var.vault_volume_size
  linode_id = linode_instance.node.id
  tags      = [local.name]

  lifecycle {
    prevent_destroy = true
  }
}

# ── DNS ──────────────────────────────────────────────────────────────────────────────────
#
# Two ways in, and serve_from_tunnel picks one. Off, each name is an unproxied A record to the
# Linode VM, where Traefik terminates TLS. On, each is a proxied CNAME to the home cluster's
# tunnel, below. Turning it on is the cutover; Linode stays up until it has been flipped.
# `argocd.` exists from the start but serves nothing until stage 5.
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
  }
}

resource "cloudflare_dns_record" "site" {
  for_each = local.hostnames

  zone_id = data.cloudflare_zone.site.zone_id
  name    = each.value
  type    = var.serve_from_tunnel ? "CNAME" : "A"
  content = var.serve_from_tunnel ? "${cloudflare_zero_trust_tunnel_cloudflared.home.id}.cfargotunnel.com" : local.public_ip
  ttl     = var.serve_from_tunnel ? 1 : 300 # 1 is "automatic", the only TTL a proxied record takes
  proxied = var.serve_from_tunnel
  comment = "MediaSafe infra/terraform"
}

# Only proxied names are affected, so this changes nothing while serve_from_tunnel is off. On,
# Cloudflare's edge is the only place a plain-HTTP request can be turned away: the cluster has
# no HTTP listener at all (morioh-cho-gitops, platform/edge/gateway.yaml).
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = data.cloudflare_zone.site.zone_id
  setting_id = "always_use_https"
  value      = "on"
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
  location   = "enam" # Eastern North America, near the VM. Honoured only at creation.
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
