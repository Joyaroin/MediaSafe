# 0002 — Run the cluster at home behind a Cloudflare Tunnel

- **Status:** Accepted, cut over 2026-11-02; Linode removed from Terraform 2026-11-05, closing the account still to do
- **Date:** 2026-11-03
- **Amends:** [ADR 0001](0001-deploy-to-k3s-on-linode-with-gitops.md), for where the cluster runs
  and how traffic reaches it. Its GitOps, Vault and Helm decisions stand.

## Context

ADR 0001 put k3s on one Linode 4 GB VM for about $25 a month. Two mini PCs at home can run the
same cluster, and self-hosting is the point of having them. MediaSafe is for personal use, so an
outage from home power or internet is accepted. Public traffic must not need a router port
forward.

## Decision

The same k3s version and GitOps layout, on two VMs at home. Traffic enters only through a
Cloudflare Tunnel.

| | On Linode (ADR 0001) | At home |
|---|---|---|
| **Compute** | One VM, node `mediasafe` | `hamon` (server) on the Proxmox host `jonathan`, `hermit` (agent) on `joseph` |
| **Placement** | Everything on one node | Prod, Vault and the control plane on `hamon`, staging on `hermit`, one `cloudflared` on each |
| **Node install** | Terraform and cloud-init | `bootstrap/install-k3s` and `install-k3s-agent` in `morioh-cho-gitops` |
| **Way in** | Cloud Firewall, ports 80 and 443 open | `cloudflared` dials out to the tunnel. No open ports, and Traefik is a ClusterIP Service |
| **DNS** | Unproxied A records | Proxied CNAMEs to the tunnel (`serve_from_tunnel`) |
| **HTTP to HTTPS** | Traefik's redirect | Cloudflare's Always Use HTTPS. The Gateway has no HTTP listener |
| **Certificates** | Let's Encrypt, HTTP-01 | Let's Encrypt, DNS-01 on Cloudflare |
| **Vault's disk** | Block Storage volume | A `local` PersistentVolume at `/mnt/vault-data`, pinned to `hamon` |
| **Admin access** | SSH and 6443 from one home IP | The Kubernetes API over Tailscale, SSH from the LAN and Tailscale |
| **GitOps repo** | `mediasafe-gitops`, private, deploy key | `morioh-cho-gitops`, public, read over HTTPS with no credential |

Unchanged: Neon, GHCR, `image.yml` and `promote.yml`, Argo CD, Vault with External Secrets, the
Helm chart, R2 for Terraform state and Vault snapshots, and unsealing Vault by hand after every
restart.

## Consequences

- **`jonathan` is a single point of failure.** Prod, the control plane and Vault are all on it, so
  if it goes down, so does the site. Prod stays off `hermit` so that a staging deploy or side
  project can't take its memory.
- **The client's address comes from a Cloudflare header.** Every request reaches Traefik from
  `cloudflared`, so Better Auth rate-limits on `cf-connecting-ip`. That is safe only while Traefik
  has no public port: a direct visitor could set that header themselves.
- **Terraform no longer builds the machines.** `infra/terraform` owns the Cloudflare side. A lost
  node is rebuilt with the bootstrap scripts and the cluster from git.
- **`cloudflared` needs DNS to reconnect.** After a router restart the site can return 530 until
  DNS is back and the pods leave crash-loop back-off. One copy per node lets either node restart.

## The way back, and teardown

**Update, 2026-11-05:** the Linode VM was deleted by hand, so the way back below no longer exists.
The `linode_*` resources were dropped from Terraform state without destroying anything left on
Linode, so any volume or firewall still there has to be deleted in its console.

The Linode VM is powered off, not deleted. Going back is **not** just `serve_from_tunnel = false`:
`morioh-cho-gitops` `main` now describes the home cluster (prod pinned to `hamon`, ClusterIP
Traefik, no HTTP listener, DNS-01), and Linode's Argo CD would sync it on boot. The gitops commits
would have to be reverted too, and Linode's Vault is as it was at the cutover.

Teardown, planned for about 2026-11-09, once a home snapshot is confirmed in R2 and a restore drill
has passed:

1. Remove the `linode_*` resources from `infra/terraform` in a PR, taking `prevent_destroy` off the
   Vault volume on purpose, along with `fetch-kubeconfig`, `cloud-init.yaml.tftpl` and
   `serve_from_tunnel`.
2. Drop the `mediasafe` node check from `infra/vault/tf`.
3. Delete the `mediasafe/linode-token` item and close the account. Billing continues until then.
