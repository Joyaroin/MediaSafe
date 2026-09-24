# MediaSafe

A personal tracker for the films and shows I watch. Third iteration; single data path,
single deploy target.

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
| `scripts/` | `build.ts` is the deploy build command — the migration is its first half. `provision.sh` is the setup wizard. |
| `tests/` | Vitest, against a real local Postgres. `tests/e2e/` is the one exception — Playwright, `npm run test:e2e`, run locally only. |
| `vercel.json` | Declares the framework as `nextjs` and the build command. See below — it is load-bearing, not boilerplate. |
| `.squawk.toml` | squawk, narrowed to the destructive rules. Every exclusion carries its reason. |

Sentry is wired through `instrumentation.ts` (server and edge), `instrumentation-client.ts`
(browser) and `withSentryConfig` in `next.config.ts`. The reference id a reader is shown **is**
the Sentry event id; nothing here mints a second identifier.

The Vercel project was created before this repository had a `package.json`, so Vercel's
framework detection found nothing and the project settings kept `Other`. Under that preset a
Next.js build compiles perfectly and then fails looking for a static `public/` directory.
`vercel.json` states the framework in the repository, where it is reviewable and survives the
project being recreated, rather than leaving it to a dashboard toggle nobody can see from here.

It states the build command for the same reason, and there the stakes are higher: the build
command's first half is the production migration, and `vercel.json` overrides the dashboard, so
the migration cannot be dropped out of a deploy by a setting nobody is looking at.

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
