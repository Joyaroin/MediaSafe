variable "domain" {
  description = "The apex domain MediaSafe is served from. Its DNS must be on Cloudflare."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+(\\.[a-z0-9-]+)+$", var.domain))
    error_message = "Set domain in terraform.tfvars to the domain you bought, e.g. mediasafe.app."
  }
}

variable "cloudflare_account_id" {
  description = "The Cloudflare account that holds R2. Not secret: it is in every R2 URL, including backend.hcl's."
  type        = string
}
