# MediaSafe

## Status

**Active — this is the tracker being built.** Third iteration, replacing `~/tvtracker`.

A working codebase, not a spec-stage repo — do not treat it as greenfield. `app/`, `db/`, `lib/`,
`tests/`, `drizzle/` and custom `eslint-rules/` all exist. For how far along it is, read
`git log`, not this file.

Stack: Next.js on k3s (one Linode VM, Argo CD from `mediasafe-gitops`; ADR 0001), Postgres on
Neon, Drizzle.

## Work

Work is tracked on GitHub Issues. A piece of work is a `Spec:` issue (e.g. #357, #360) whose
slices are its native **sub-issues**, each with `## Parent`, `## What to build`,
`## Acceptance criteria` and `## Blocked by`. Blocking is GitHub's native issue dependency, not a
body line. Read the open spec and its sub-issues before touching anything. Issue #1 is the
original spec-stage map; it is closed and historical.

## Shipping

A merge to `main` is a staging deploy: `image.yml` builds the image and commits its tag to
`mediasafe-gitops`'s `values-staging.yaml`, and Argo CD runs pending migrations as a Job before
the new pods roll out (staging.mediasafe.space). Prod is a separate promotion (`promote.yml`).

CI (`ci.yml`) runs typecheck, lint, build, the route manifest and a few named suites — **not**
the full Vitest suite. Run that locally before merging; it needs the local Docker Postgres and
the `.env` that `scripts/provision.sh` writes, which `vitest.config.mts` loads through
`dotenv/config`: `npx vitest run`. Not `.env.development.local` — that points at a dead Neon
database.

The error discipline below is not optional.

@AGENTS.md
