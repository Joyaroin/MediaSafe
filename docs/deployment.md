# Deployment

`main` is production. Merging is a release. There is no staging, and nothing gates the
merge — so the pipeline had to be right before the features arrived, which is why this
sits at issue #39 rather than at the end.

`SPEC.md` §6 is the decision; this is how it is wired.

## The path from a merge to production

```
merge to main
    │
    ├─ Vercel starts a Production build
    │     └─ npm run build  →  scripts/build.ts
    │            ├─ 1. db/migrate.ts, against the production Neon branch
    │            │      fails → the build fails here, and stops
    │            └─ 2. next build
    │
    └─ build succeeded → a deployment is created and promoted
       build failed    → no deployment exists, the previous one keeps serving
```

**The migration is the first half of the build command**, and that ordering is the whole
safety property. Run it the other way round — migrate after a successful build — and you
get new schema under old code, or old schema under new code, with nothing in the pipeline
able to stop either.

Two things have to hold for that to mean anything, and both are held by something other
than good intentions:

| Claim | What holds it |
| --- | --- |
| A failed migration produces no deployment | `scripts/build.ts` awaits the migration and never reaches `next build` on rejection. `tests/build-command.test.ts` asserts the ordering *and* the non-call. |
| A failed migration leaves the schema unchanged | Drizzle's migrator wraps the **entire pending run** in one transaction, so a failure rolls back every file in it. `tests/migrator-transaction.test.ts` asserts it against a real Postgres; the note at the top of `db/migrate.ts` explains it. |

### It fails closed

`scripts/build.ts` reads `VERCEL_ENV` to decide whether this build migrates. If that
variable is missing or holds a name it does not recognise, **it refuses to build** rather
than treating the unknown as "not production". Guessing wrong in that direction ships new
code against an un-migrated schema, which is the exact failure the ordering exists to
prevent. A refused build costs one red deployment.

### `vercel.json` states the build command on purpose

`"buildCommand": "npm run build"` is already Vercel's default for a Next.js project, so
the line looks redundant. It is not: `vercel.json` overrides the dashboard, so stating it
here means the migration cannot be dropped out of the build by someone changing a
project setting. The same reasoning as `"framework": "nextjs"` — see the README.

## Previews

A pull request gets a preview deployment against **one shared, schema-only Neon branch
holding zero production rows** (issue #18). **Migrations do not run on preview.**

That is a decision, not an oversight. One branch serves every open PR at once; a preview
that migrated would move it under all the others, and would apply a migration nobody had
merged to something long-lived. The accepted cost, taken knowingly:

> **A schema-changing PR has a broken preview, and is verified locally instead.**

Local is the real check for schema work — `npm run db:up` against Docker Postgres runs
the same runner over the same files.

### Seeding the shared branch is a one-off, not a deploy step

`npm run db:seed` (issue #74, [docs/local-development.md](local-development.md#seed-data))
fills the shared preview branch by running MediaSafe's own import against it directly —
`DATABASE_URL` pointed at the preview branch for the one command, same as any other
manual `psql`/`drizzle-kit` operation against it. **It is not wired into any pipeline.**
Migrations do not run on preview (above), so there is no build step this could hook into
without moving the branch under every other open PR — the same cost that keeps migrations
out.

Whether the fixture is re-imported automatically on some cadence, and if so when, is a
call nobody has made. `applyImportChunk`'s idempotence is what keeps that choice safe
either way: running the command again writes only what has genuinely changed, so
"run it by hand, occasionally" and "never run it again" are both fine outcomes, not just
tolerable ones.

## CI

`.github/workflows/ci.yml` runs **typecheck, lint, build and squawk** on every pull
request. It gates nothing, because nothing can gate a merge here: rulesets and branch
protection are Pro-or-above on a private repository and both ways of paying were declined
(issue #17). A red check is a red X next to a button that still works.

Every check runs even after one fails — a gate stops at the first failure because nothing
past it can change the answer, but this produces a list to read before pressing merge, and
one-of-four is three-quarters useless.

**squawk** is test 4 of the four in `SPEC.md` §6. It is narrowed in `.squawk.toml` to the
destructive rules plus the three that hold the one-transaction model up, and it is what
makes expand-contract mechanically checkable rather than remembered. Read that file before
changing it — every exclusion carries its reason, and `squawk-cli` is pinned to an exact
version so a release cannot switch a new rule on mid-PR.

Run it yourself with `npm run lint:sql`.

## Rolling back

**Rollback is a redeploy of the previous deployment.** Vercel → the project → Deployments
→ the last good one → *Instant Rollback* (or *Promote to Production*). It re-serves an
already-built deployment, so it takes seconds and builds nothing.

**It rolls back code, and only code.** The schema is not touched, and that is why
constraint 7 exists:

> **Expand-contract, forward-only.** A column is never dropped in the change that stops
> using it.

Because the previous code has to keep working against the *new* schema, and it only does
if the new schema is a superset of the old one. squawk enforces the half of that a human
forgets. Neon Free keeps six hours of history and a restore overwrites the branch, so
there is no schema rollback worth the name — the discipline is the protection.

## The bill

Nothing added here is a paid service: Vercel Hobby, Neon Free, and GitHub Actions inside
the monthly allowance for private repositories. Two habits keep the last one honest:
superseded CI runs are cancelled (`concurrency` in the workflow), and CI runs on pull
requests only, not on every push to every branch.

**That is an argument, not a reading.** Constraint 8 caps recurring spend at £5/month and
issue #39 asks that it still be £0 — which is a fact about three billing pages, and
billing pages are dashboards. It is a checklist item below like every other one, rather
than a sentence here asserting an amount nobody checked.

## What only Adham can do

Everything above is in the repository. These are in dashboards, and they are the half of
issue #39 that no agent can reach.

### Settings to confirm once

- [ ] **Vercel → Settings → Git**: the project is connected to `Joyaroin/MediaSafe`, and
      the Production Branch is `main`.
- [ ] **Vercel → Settings → Environment Variables**, at the scopes issue #37 set:
      `DATABASE_URL` = `NEON_PRODUCTION_URL` in **Production**, and
      `DATABASE_URL` = `NEON_PREVIEW_URL` (the shared schema-only branch) in **Preview**.
      Both pooled — the host with `-pooler` in it.
- [ ] **`DATABASE_WS_PROXY` is set in neither scope.** Neon speaks WebSocket itself;
      setting it there routes production through a proxy that does not exist.
- [ ] **Vercel → Settings → Build**: no dashboard Build Command that disagrees with
      `vercel.json`. `vercel.json` wins, but a disagreement is a trap for the next reader.

### Verifications the acceptance criteria ask for

- [ ] **Merging to `main` deploys to production.** True on the first merge that carries
      this file.
- [ ] **A failed migration leaves the previous deployment serving.** Demonstrated locally
      (below); worth watching once for real when the first real migration lands.
- [x] **A pull request produces a preview deployment.** Proven on PR #47: Vercel built
      and deployed the branch, `Ready`.
- [ ] **…and it is against the shared schema-only branch.** Not confirmed, and it cannot
      be from outside: preview Vercel Authentication is on, so the preview answers `302`
      to anything unauthenticated. Open it signed in and read `/` — the press check
      prints `current_database()`, so the branch it reached is on the page rather than
      assumed.
- [ ] **Rolling back is a redeploy, exercised once.** Deliberately roll back to the
      previous deployment and back again, on a day when nothing is wrong. A recovery
      procedure first attempted during a failure is not a procedure. Note the tense the
      criterion uses — *exercised*. Writing the procedure down, which this file does, is
      not doing it.
- [ ] **Recurring spend is still £0.** Vercel → Settings → Billing shows Hobby, Neon
      shows Free, and GitHub → Settings → Billing shows Actions minutes inside the
      allowance. Three pages, read once. Nothing in this ticket adds a paid service, but
      that is a claim about what was added, not a reading of what is charged.

## What was demonstrated, and how

Run against local Docker Postgres and a throwaway database, on 2026-08-17:

**A failed migration halts the build before `next build`.** The `fails-partway` fixture
was put in `drizzle/`, `.next` deleted, and the build command run with `VERCEL=1
VERCEL_ENV=production` against a scratch database holding one table:

```
[build] migrating production before building
[build] failed. No deployment is created from a failed build.
DrizzleQueryError: Failed query: ALTER TABLE "tracer_absent" ADD COLUMN "note" text;
BUILD EXIT=1

no .next — next build never ran
schema after the failed deploy: serving        (unchanged)
tables left by the rolled-back migration: (none)
```

`next build` never ran, so there is no build output, so Vercel creates no deployment. The
schema is the one it started with.

**squawk fails on a dropped column and a dropped table.** A throwaway migration —
`ALTER TABLE … DROP COLUMN` and `DROP TABLE` — was put in `drizzle/`, and
`npm run lint:sql` reported `ban-drop-column` and `ban-drop-table` and exited 1. An
ordinary `CREATE TABLE` migration in the same place reported nothing and exited 0, so the
narrowing is doing its job in both directions. **Neither throwaway is committed.**

**The build needs no database.** `npm run build` with `DATABASE_URL` unset completes:
`/` is `force-dynamic`, so nothing is prerendered. That is what lets CI build without a
connection string, and it means CI cannot migrate anything even by accident.

**CI runs all four checks on a pull request.** Not argued from the workflow file — run
[32068428234](https://github.com/Joyaroin/MediaSafe/actions/runs/32068428234) on PR #47
is green across typecheck, lint, build and squawk.

Its first run was not. `npm ci` failed before any check with
`Missing: esbuild@0.28.2 from lock file` — and that was **not** a fault in this branch:
`origin/main`'s lock fails npm 10 identically, checked by running `npm@10.9.8 ci` against
it untouched. The lock is npm 11's, npm 11 writes tsx's nested optional-dependency
subtree in a shape npm 10 rejects, and Node 22 ships npm 10. The bug was always there and
had nothing to fail it until there was a CI job. The workflow now installs npm 11 before
`npm ci`, and `docs/local-development.md` names npm 11 as a prerequisite in its own right.

Which is the argument for this ticket sitting early, made by the ticket itself: the first
thing the pipeline caught was the repository it was pointed at.
