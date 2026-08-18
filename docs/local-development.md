# Local development

Local Docker Postgres is one of the two long-lived environments in `SPEC.md` §6. The
other is production on Neon. There is no staging.

## Prerequisites

- **Node 22 or newer** — this was built and verified on 24.13.
- **npm 11 or newer.** Not the same statement: Node 22 ships npm 10, and npm 10 cannot
  read this repository's lock file — `npm ci` fails with
  `Missing: esbuild@0.28.2 from lock file`, because npm 11 writes tsx's nested
  optional-dependency subtree in a shape npm 10 rejects. `npm install -g npm@11` if
  `npm --version` says 10. Node 24 already ships npm 11.
- **Docker**, with the daemon running. `docker compose` v2 or newer.

## From a fresh clone to a running app

```bash
npm install
npm run db:up            # starts Postgres + the WebSocket proxy, applies migrations
npm run dev              # http://localhost:3000
```

You need a `.env` first. `scripts/provision.sh` writes one — it is the full
provisioning wizard for issue #37, and it also writes a committed `.env.example`. If you
only want the database up and are not provisioning Google, Sentry or Neon, these two
lines are the whole of what this ticket needs:

```bash
DATABASE_URL=postgres://mediasafe:mediasafe@localhost:5432/mediasafe
DATABASE_WS_PROXY=localhost:5433
```

Neither is a secret: that database is local, empty, and holds nobody's watch history.
**`DATABASE_WS_PROXY` must be left unset in production and preview** — Neon speaks the
WebSocket protocol itself, and setting it there would route production through a proxy
that does not exist.

### The TMDB token

Search and add need one more, and it **is** a secret:

```bash
TMDB_READ_ACCESS_TOKEN=
```

It is the **v4 "API Read Access Token"** from
<https://www.themoviedb.org/settings/api> — the long JWT, not the v3 `api_key`.
`tmdb/catalogue.ts` sends it as a bearer header and never as a query parameter, so it
does not end up in access logs or in a quoted URL.

Without it, `/search` renders its *search failed* state — deliberately, and
distinguishably from *no results*. Nothing else in the application needs it: ADR-0001's
*the read path never calls TMDB for a mirrored field* means the library, the five states,
progress and up next all work with TMDB unreachable and this variable unset.

The same value goes into Vercel's Production **and** Preview scopes; preview builds
against the schema-only Neon branch still want a working search.

`npm run db:up` is the one command that brings the database up and migrates it: it waits
for Postgres to report healthy, then runs the same migration runner that production runs.

The page at `/` is a press check — Postgres's version, the database name, the server
clock and the applied migration history, all read live when you request the page. If it
renders, the whole path is open: browser → app → WebSocket pool → Postgres → back.
Nothing on it is hardcoded, and when there is a library to show it is replaced by one.

## Why there are two containers

The app and the migration runner use **one driver**: `drizzle-orm/neon-serverless` over a
WebSocket `Pool` (`SPEC.md` §6). Not Neon's HTTP interface, which has no interactive
transactions — and two things here need one: the watch write at build step 4, and
halt-on-partial-failure in the migration runner now.

That driver speaks the Postgres wire protocol wrapped in a WebSocket. Neon's servers
understand that; a stock Postgres does not. So `wsproxy` sits in front of the database,
unwraps the WebSocket and forwards raw TCP.

Reaching for `node-postgres` locally would be the easier fix, and it is exactly the thing
constraint 1 forbids: local would become a different data path from production, and the
first bug that only reproduces in one of them would cost more than this container ever
will.

`wsproxy` shares the database container's network namespace, so `localhost:5432` means
the same thing inside the proxy as it does on your laptop. That is what lets one
`DATABASE_URL` serve the driver, `psql` and `drizzle-kit` alike, rather than three.

```
  next dev ─┐
            ├─ @neondatabase/serverless Pool ─ ws://localhost:5433 ─ wsproxy ─┐
  migrate ──┘                                                                │
                                                       tcp://localhost:5432 ─┘
                                                                             │
  drizzle-kit generate ──────────── tcp://localhost:5432 ────────── postgres ─┘
```

## The scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The app, on `http://localhost:3000`. |
| `npm run db:up` | Postgres + proxy up, wait for healthy, apply migrations. |
| `npm run db:down` | Stop both containers. The volume survives. |
| `npm run db:reset` | Destroy the volume and start over. Everything local is lost. |
| `npm run db:generate` | Diff `db/schema.ts` and write a new `.sql` into `drizzle/`. |
| `npm run db:migrate` | Apply pending migrations. What production runs. |
| `npm run db:psql` | A `psql` shell in the database container. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run lint:sql` | squawk over `drizzle/*.sql`. Fails on a dropped column or table. |
| `npm run build` | The deploy build command. Locally that is `next build` alone — see below. |
| `npm test` | Vitest. **Needs the database up.** |

`npm run build` is not `next build` any more: it is `scripts/build.ts`, which is the
command Vercel runs, and **on a production deployment it migrates first**. Off Vercel it
skips straight to `next build`, so building on your laptop never touches your database.
The ordering, and why it is that way round, is in
[`docs/deployment.md`](deployment.md).

## Changing the schema

```bash
# 1. edit db/schema.ts
npm run db:generate      # writes drizzle/NNNN_name.sql
# 2. READ the generated SQL, and edit it if it is wrong
npm run db:migrate       # apply it
```

```bash
npm run lint:sql         # 3. what CI will say about it
```

Generated SQL is committed as plain, hand-editable `.sql` on purpose. `squawk` lints SQL
*text* (`SPEC.md` §6, test 4), so a TypeScript migration would be unlintable and
expand-contract would stop being mechanically checkable. drizzle-kit hashes each file
when it is *applied*, not when it is written, so editing a generated file before you
commit it is expected rather than detected.

Two rules bind every migration — **expand-contract, forward-only**, and **no statement
that Postgres forbids inside a transaction block**. Both are explained in
`drizzle/README.md`, and the second one is not obvious. Read it before build step 2.

## Tests

`npm test` runs against the real local Postgres, with migrations applied by the real
runner. There is no in-memory substitute and no mocked constraint: the properties worth
testing here live in Postgres, and a mock of a unique constraint tests the mock.

Tests create and drop their own scratch databases, so running them does not disturb the
database you develop against.

### Writing one

`tests/support/database.ts` is the harness for anything that touches rows. Two calls:

```ts
import { inTransaction, setUpTestDatabase } from "./support/database";

setUpTestDatabase("mediasafe_watch_test");   // a name no other test file uses

it("does not record the same click twice", async () => {
  await inTransaction(async (tx) => {
    // …insert, read back, assert. Rolled back whatever happens.
  });
});
```

`setUpTestDatabase` creates a database, migrates it with `db/migrate.ts` — the runner
production runs — and drops it when the file finishes. `inTransaction` wraps one test in
a transaction and always rolls it back. The header of `tests/support/database.ts` explains
what that buys and what it deliberately does not do.

Note that `tests/migrator-transaction.test.ts` does **not** use this harness: those tests
cannot roll back, because the transaction is the thing they are testing.

### The data-access choke point

Owned rows are read and written through `db/access.ts`, and every function there takes
the user id as its first argument. A session becomes a user id in exactly one place,
`lib/session.ts`. **Read `db/access.ts`'s own header before adding a query** — it holds
the reasoning, and this section deliberately does not repeat it.

ESLint enforces the boundary: nothing outside `db/` and `tests/` may import
`@/db/client`, `@/db/driver` or `drizzle-orm`, by any specifier. If you hit that error,
the query belongs in `db/access.ts`.

## When it does not work

**`DATABASE_URL is not set`** — there is no `.env`. See the two lines above, or run
`scripts/provision.sh`.

**The page 500s with a connection error** — the containers are not up. `docker compose ps`
should show `mediasafe-postgres` healthy and `mediasafe-wsproxy` up.

**`proxying to specified address not allowed`** in `docker compose logs wsproxy` — the
host in `DATABASE_URL` is not what the proxy's `ALLOW_ADDR_REGEX` permits. It is narrowed
to exactly `localhost:5432` on purpose; widen it in `docker-compose.yml` deliberately or
not at all.

**Tests fail to create a scratch database** — something is still connected to a previous
one. `npm run db:reset` clears it.
