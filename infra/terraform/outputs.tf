output "vault_snapshots_bucket" {
  value = cloudflare_r2_bucket.vault_snapshots.name
}

output "tunnel_id" {
  description = "Not secret: it is in the CNAME every hostname points at."
  value       = cloudflare_zero_trust_tunnel_cloudflared.home.id
}
