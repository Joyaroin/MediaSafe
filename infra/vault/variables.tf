variable "admin_email" {
  description = "The one Google account that may sign in to Vault (and Argo CD) as admin."
  type        = string
  default     = "adhamseddik546@gmail.com"
}

variable "google_admin_client_id" {
  description = "The \"MediaSafe admin\" Google OAuth client. ./tf reads it from Bitwarden."
  type        = string
}

variable "google_admin_client_secret" {
  description = "Its secret. Ephemeral and passed only to a write-only argument, so it reaches Vault but never state or a plan file."
  type        = string
  sensitive   = true
  ephemeral   = true
}
