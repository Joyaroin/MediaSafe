# infra/terraform — Cloudflare

The Cloudflare side of the home cluster, meaning [the tunnel](#the-home-clusters-tunnel), the DNS
records and the R2 snapshot bucket. Everything that runs *on* the cluster is Argo CD's, not this
directory's, and the nodes are installed by `bootstrap/` in `morioh-cho-gitops`.

## One-time setup

1. **Buy the domain** on Cloudflare Registrar, and put it in `terraform.tfvars`.
2. **Create the state bucket** by hand: Cloudflare → R2 → Create bucket → `mediasafe-tfstate`.
   Put your Cloudflare account id into `backend.hcl`'s endpoint.
3. **Create two tokens** and store each as a Bitwarden *login* item with exactly this name:

   | Bitwarden item | Username | Password | Where to create it | Scope |
   |---|---|---|---|---|
   | `mediasafe/cloudflare-token` | — | the token | Cloudflare → My Profile → API Tokens | Zone → DNS → Edit and Zone → Zone Settings → Edit, on your one zone; Account → Workers R2 Storage → Edit (the snapshot bucket); Account → Cloudflare Tunnel → Edit (the home cluster's tunnel) |
   | `mediasafe/r2-terraform-state` | Access Key ID | Secret Access Key | Cloudflare → R2 → Manage API tokens | Object Read & Write, on `mediasafe-tfstate` only |

   A fourth key is created **after the first apply that makes `mediasafe-vault-snapshots`**, and
   goes into Vault rather than being read by `./tf`:

   | Bitwarden item | Username | Password | Where to create it | Scope |
   |---|---|---|---|---|
   | `mediasafe/r2-vault-snapshots` | Access Key ID | Secret Access Key | Cloudflare → R2 → Manage API tokens | Object Read & Write, on `mediasafe-vault-snapshots` only |

4. **Install the tools:** `brew install bitwarden-cli`, and log in once with `bw login`.

## Running it

```sh
export BW_SESSION="$(bw unlock --raw)"
./tf init
./tf plan
./tf apply
```

`./tf` loads the two tokens into its own environment and runs Terraform; nothing is written
to disk. Back the state up after any apply that matters — R2 keeps no versions:
`./tf state pull > ~/mediasafe-tfstate-$(date +%F).json` (it holds no secrets, but keep it off git).

## The home cluster's tunnel

The cluster runs on `hamon` and `hermit`, VMs on the home Proxmox hosts `jonathan` and `joseph`,
and the home network opens no ports: Cloudflare reaches it through a Tunnel whose connector runs in the cluster (`morioh-cho-gitops`,
`platform/cloudflared`). This stack owns the tunnel, its routes and the DNS that points at it.

The connector's token is the one secret here, and it never passes through Terraform. After the apply
that creates the tunnel, copy it from Cloudflare's API straight into Vault, without it ever being
printed (Vault port-forwarded and logged in as in `infra/vault/README.md`):

```sh
export BW_SESSION="$(bw unlock --raw)"
curl -fsS -H "Authorization: Bearer $(bw get password mediasafe/cloudflare-token --session "$BW_SESSION")" \
  "https://api.cloudflare.com/client/v4/accounts/$(awk -F'"' '/cloudflare_account_id/ {print $2}' terraform.tfvars)/cfd_tunnel/$(./tf output -raw tunnel_id)/token" \
  | jq -er .result | vault kv put kv/infra/cloudflared/tunnel token=-
```
