output "ip_address" {
  value = local.public_ip
}

output "ssh" {
  value = "ssh root@${local.public_ip}"
}

output "vault_volume_path" {
  value = linode_volume.vault.filesystem_path
}

output "vault_snapshots_bucket" {
  value = cloudflare_r2_bucket.vault_snapshots.name
}
