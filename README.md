# MediaSafe

A personal tracker for the films and shows I watch. Third iteration; single data path,
single deploy target.

```bash
npm install
cp env.example .env
npm run db:up
npm run dev
```

Full setup, the container topology and the troubleshooting list are in
[`docs/local-development.md`](docs/local-development.md).

## The documents

Read them in this order; where two disagree, the higher one wins.

| | |
| --- | --- |
| [`SPEC.md`](SPEC.md) | The build spec. Build order, the eight constraints, the v1 boundary. **Start here.** |
| [`CONTEXT.md`](CONTEXT.md) | The domain language. Binding on every identifier, table name and string on screen. |
| [`docs/adr/0001-…`](docs/adr/0001-watch-identity-and-derived-state.md) | The schema and what is derived rather than stored. |
| [`DESIGN.md`](DESIGN.md) | The visual world. Tokens, rules, components. |
| [`docs/design/v1-surfaces.md`](docs/design/v1-surfaces.md) | The screens. Partly superseded — see `SPEC.md` §10.2. |
| [`PRODUCT.md`](PRODUCT.md) | Historical. Stale in eight places. Do not build from it. |

## The shape of the code

| | |
| --- | --- |
| `app/` | The Next.js app. `globals.css` is `DESIGN.md`'s token layer and the only styling that exists. |
| `db/` | `driver.ts` owns the one driver, `client.ts` the app's pool, `migrate.ts` the migration runner. |
| `drizzle/` | Generated migrations, committed as plain SQL. Read `drizzle/README.md` before adding one. |
| `tests/` | Vitest, against a real local Postgres. |

## What is true from the first merge

- **One data path.** One driver — `drizzle-orm/neon-serverless` over a WebSocket `Pool` —
  for the app and the migration runner, locally and in production. No second
  implementation, no read cache, no local store, no offline queue.
- **Empty and failed are structurally separate.** **No `catch` returns `[]`.** A read
  failure throws; an empty state is reachable only by a successful zero-row query.
- **Expand-contract, forward-only.** A column is never dropped in the change that stops
  using it.
- **A migration that fails partway applies nothing at all.** The whole pending run is one
  transaction — see the note at the top of `db/migrate.ts`.
