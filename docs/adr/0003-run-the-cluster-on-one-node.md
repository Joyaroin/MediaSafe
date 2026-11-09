# 0003 — Run the cluster on one node

- **Status:** Accepted, done 2026-11-09
- **Date:** 2026-11-09
- **Amends:** [ADR 0002](0002-run-k3s-at-home-behind-a-cloudflare-tunnel.md), for which machines
  the cluster runs on and what runs where. Its tunnel, DNS, certificate and access decisions stand.

## Context

ADR 0002 ran the cluster on two VMs: `hamon` on the Proxmox host `jonathan`, with prod, Vault and
the control plane, and `hermit` on `joseph`, with staging. `jonathan` is going back to Amazon, so
everything on `hamon` had to move, the control plane included: `hermit` was an agent of `hamon`,
and without it there is no cluster.

## Decision

One VM, `hermit` on `joseph`, runs everything.

| | Two nodes (ADR 0002) | One node |
|---|---|---|
| **Compute** | `hamon` (server) on `jonathan`, `hermit` (agent) on `joseph` | `hermit` (server) on `joseph`, raised from 3 GB to 6 GB of RAM |
| **Datastore** | SQLite on `hamon` | Embedded etcd on `hermit` |
| **Placement** | Prod, Vault and the control plane on `hamon`, staging on `hermit` | Everything on `hermit`, prod and staging side by side |
| **Node install** | `bootstrap/install-k3s` and `install-k3s-agent` in `morioh-cho-gitops` | `bootstrap/install-k3s`, for `hermit`, with `cluster-init` |
| **Vault's disk** | A `local` PersistentVolume at `/mnt/vault-data`, pinned to `hamon` | The same path and data, pinned to `hermit` |
| **Admin access** | The Kubernetes API at `hamon`'s Tailscale address | The same at `hermit`'s, `100.80.32.26` |

The cluster was moved, not rebuilt, so its identity, certificates, Secrets encryption key and
Argo CD state carried over. `hamon` was switched from SQLite to embedded etcd, `hermit` joined it
as a second server, the workloads moved by git (`nodeSelector`, Vault's PersistentVolume) and a
drain, and then `hamon` was deleted from the cluster, which removed its etcd member. Vault's Raft
data was copied with checksums compared, so its unseal key did not change.

## Consequences

- **`joseph` is the single point of failure**, where `jonathan` was. Prod, staging, the control
  plane and Vault are all on it.
- **Prod and staging share memory.** ADR 0002 kept prod off `hermit` so a staging deploy or side
  project couldn't take its memory. That separation is gone; memory limits stand in for it. The
  chart caps the app at 512Mi and Valkey at 192Mi in every environment, and lab caps itself at
  256Mi, so staging tops out at about 960Mi of the node's 6 GB.
- **Both `cloudflared` copies are on one node.** ADR 0002's "one copy per node lets either node
  restart" no longer holds: a restart of `hermit` takes the site down until it is back.
- **A second node can join later.** etcd lets another server join; `bootstrap/install-k3s` lists
  the ports one would need.
