# MediaSafe

A personal tracker for the films and shows I watch. Third iteration; single data path,
single deploy target: k3s on one Linode VM, deployed by Argo CD from
[`mediasafe-gitops`](https://github.com/Joyaroin/mediasafe-gitops)
([ADR 0001](docs/adr/0001-deploy-to-k3s-on-linode-with-gitops.md)).

```bash
npm install
./scripts/provision.sh   # writes .env
npm run db:up
npm run dev
```

`scripts/provision.sh` writes the two lines `.env` needs; `npm run db:up` brings up
Postgres and the WebSocket proxy in front of it and runs the migrations.

## The shape of the code

| | |
| --- | --- |
| `app/` | The Next.js app. `globals.css` is the token layer and the only styling that exists. |
| `db/` | `driver.ts` owns the one driver, `client.ts` the app's pool, `migrate.ts` the migration runner. |
| `drizzle/` | Generated migrations, committed as plain SQL. Read `drizzle/README.md` before adding one. |
| `errors/` | The three failure surfaces and the reference id. Read `AGENTS.md` before adding a fourth. |
| `eslint-rules/` | Local rules. One so far: `no-empty-catch`, which is constraint 2 made mechanical. |
| `fixtures/` | **The only surviving copy of `tvtracker`'s database**, archived and never loaded. Read [`fixtures/README.md`](fixtures/README.md) before touching it — the `auth` schema was removed and the reasons matter. |
| `scripts/` | `provision.sh` is the setup wizard; `db-seed.ts` seeds a database through the app's own import. |
| `tests/` | Vitest, against a real local Postgres. `tests/e2e/` is the one exception — Playwright, `npm run test:e2e`, run locally only. |
| `infra/` | Terraform for the VM, its volume, firewall and DNS (`infra/terraform`), and for Vault's configuration (`infra/vault`). |
| `.squawk.toml` | squawk, narrowed to the destructive rules. Every exclusion carries its reason. |

Sentry is wired through `instrumentation.ts` (server and edge), `instrumentation-client.ts`
(browser) and `withSentryConfig` in `next.config.ts`. The reference id a reader is shown **is**
the Sentry event id; nothing here mints a second identifier.

## How it ships

Every push to `main` builds the image (`.github/workflows/image.yml`), pushes it to GHCR as
`ghcr.io/joyaroin/mediasafe:<sha>`, and commits that SHA to staging in the gitops repo; Argo CD
runs the migration Job, then rolls out. **Promote** (`.github/workflows/promote.yml`, run by
hand) gives prod the image staging runs. The migration is an Argo CD Sync hook that runs before
the new pods: a failed migration fails the sync and the old pods keep serving.

- Staging: https://staging.mediasafe.space (own Neon branch). Prod: https://mediasafe.space.
- The nightly sweep is a CronJob in each namespace calling `/api/cron/nightly-sweep` with
  `CRON_SECRET`.
- Secrets live in Vault and reach the pods through External Secrets; none are in git.
- [`docs/infra-migration-handoff.md`](docs/infra-migration-handoff.md) is the runbook.

## What is true from the first merge

- **One data path.** One driver — `drizzle-orm/neon-serverless` over a WebSocket `Pool` —
  for the app and the migration runner, locally and in production. No second
  implementation, no read cache, no local store, no offline queue.
- **Empty and failed are structurally separate.** **No `catch` returns `[]`.** A read
  failure throws; an empty state is reachable only by a successful zero-row query. Enforced
  by `mediasafe/no-empty-catch`, so `npm run lint` fails on it rather than a reviewer
  catching it.
- **A lost write is never silent, and a read failure never looks empty.** The three
  treatments and where each one goes are in `AGENTS.md`.
- **Expand-contract, forward-only.** A column is never dropped in the change that stops
  using it.
- **A migration that fails partway applies nothing at all.** The whole pending run is one
  transaction — see the note at the top of `db/migrate.ts`.
