# infra/terraform — the node

Stage 2 of [ADR 0001](../../docs/adr/0001-deploy-to-k3s-on-linode-with-gitops.md): one Linode
4 GB VM running k3s, the Block Storage volume Vault keeps its data on, a Cloud Firewall, and
the Cloudflare DNS records. Everything that runs *on* the cluster is Argo CD's, not this
directory's.

## What survives what

| Change | What happens |
|---|---|
| `cloud-init.yaml.tftpl`, `image`, the SSH key | **The VM is replaced.** A fresh k3s comes up, Argo CD is re-bootstrapped (stage 3) and rebuilds the cluster from git |
| The VM is replaced | The volume detaches and reattaches; cloud-init mounts it **without formatting** it, so Vault's data is intact — and sealed |
| Anything that would destroy the volume | Refused (`prevent_destroy`). Deleting it on purpose means removing that line first |
| Your home IP changes | The next plan moves the firewall's admin rule to the new IP, in place |

## One-time setup

1. **Buy the domain** on Cloudflare Registrar, and put it in `terraform.tfvars`.
2. **Create the state bucket** by hand: Cloudflare → R2 → Create bucket → `mediasafe-tfstate`.
   Put your Cloudflare account id into `backend.hcl`'s endpoint.
3. **Create three tokens** and store each as a Bitwarden *login* item with exactly this name:

   | Bitwarden item | Username | Password | Where to create it | Scope |
   |---|---|---|---|---|
   | `mediasafe/linode-token` | — | the token | Linode → API Tokens | Linodes: Read/Write, Volumes: Read/Write, Firewalls: Read/Write. Nothing else |
   | `mediasafe/cloudflare-token` | — | the token | Cloudflare → My Profile → API Tokens | Zone → DNS → Edit, on your one zone |
   | `mediasafe/r2-terraform-state` | Access Key ID | Secret Access Key | Cloudflare → R2 → Manage API tokens | Object Read & Write, on `mediasafe-tfstate` only |

4. **Install the tools:** `brew install bitwarden-cli`, and log in once with `bw login`.

## Running it

```sh
export BW_SESSION="$(bw unlock --raw)"
./tf init
./tf plan
./tf apply
```

`./tf` loads the three tokens into its own environment and runs Terraform; nothing is written
to disk. Back the state up after any apply that matters — R2 keeps no versions:
`./tf state pull > ~/mediasafe-tfstate-$(date +%F).json` (it holds no secrets, but keep it off git).

## After the first apply

```sh
ssh root@$(./tf output -raw ip_address) cloud-init status --wait   # "status: done"
ssh root@$(./tf output -raw ip_address) findmnt /mnt/vault-data    # the volume, mounted
./fetch-kubeconfig && export KUBECONFIG=~/.kube/mediasafe.yaml
kubectl get nodes                                                    # mediasafe  Ready
```

Two things the design relies on that nobody has documented, checked here once:

- **State locking on R2.** Start `./tf apply` and leave it at the prompt; in a second terminal
  `./tf plan` must fail with *Error acquiring the state lock*. If it doesn't, locking is not
  working and two applies must never overlap.
- **The API certificate covers the public IP.** `kubectl get nodes` above succeeding is the
  check. A TLS error naming the IP means `tls-san` has to be added to the k3s config.
