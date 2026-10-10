variable "domain" {
  description = "The apex domain MediaSafe is served from. Its DNS must be on Cloudflare."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+(\\.[a-z0-9-]+)+$", var.domain))
    error_message = "Set domain in terraform.tfvars to the domain you bought, e.g. mediasafe.app."
  }
}

variable "region" {
  description = "Linode region. Keep it next to the Neon project's region: every query crosses this link."
  type        = string
  default     = "us-iad"
}

variable "instance_type" {
  description = "Linode plan. g6-standard-2 is 2 vCPU / 4 GB, $24 a month."
  type        = string
  default     = "g6-standard-2"
}

variable "image" {
  type    = string
  default = "linode/ubuntu24.04"
}

variable "k3s_version" {
  description = "Pinned, so a rebuilt VM runs the same Kubernetes as the one it replaced. Upgrades are a change here."
  type        = string
  default     = "v1.36.4+k3s1"
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "admin_cidrs" {
  description = "Addresses allowed to reach SSH (22) and the Kubernetes API (6443). ./tf sets it to your current public IP."
  type        = list(string)

  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for cidr in var.admin_cidrs : can(cidrhost(cidr, 0)) && cidr != "0.0.0.0/0"])
    error_message = "admin_cidrs must be specific addresses, never 0.0.0.0/0."
  }
}

variable "vault_volume_size" {
  description = "GB of Block Storage for Vault's Raft data, at $0.10/GB a month."
  type        = number
  default     = 10
}

variable "cloudflare_account_id" {
  description = "The Cloudflare account that holds R2. Not secret: it is in every R2 URL, including backend.hcl's."
  type        = string
}
