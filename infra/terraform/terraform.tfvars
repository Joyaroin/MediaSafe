# Not secret. Tokens never go here — ./tf loads them from Bitwarden.

# The domain you bought. Its DNS must be on Cloudflare.
domain = "mediasafe.space"

# The account in backend.hcl's endpoint.
cloudflare_account_id = "e611254754d8c1922b8ead788aab6f40"

# The cluster runs at home behind a Cloudflare Tunnel; Linode is powered off and kept for a week
# as the way back. false points DNS at it again.
serve_from_tunnel = true
