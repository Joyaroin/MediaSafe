# The `tvtracker` rescue archive

**This is the only surviving copy of `tvtracker`'s database.** It is *archived and never
loaded* — nothing in the application, the test suite, the seeding path or CI reads it, and
`tests/fixture-archive.test.ts` is what keeps that true.

Committed by issue [#60](https://github.com/Joyaroin/MediaSafe/issues/60), which is
`SPEC.md` §8 **step 0** — the one step in the build order that could be started too late.

| | |
| --- | --- |
| **What** | A full `pg_dump` of `tvtracker`'s production Supabase Postgres (server 17.6, `pg_dump` 17.6) |
| **Dumped** | 2026-08-16T04:27:53Z |
| **Committed here** | 2026-08-17 |
| **Came from** | `tvtracker`'s untracked `.local-fixtures/`, and its `backups` branch at commit `5b5687d` *"backup 2026-08-16"* — the two were verified identical before this copy was taken |
| **Why here** | Both of those die with that repository, and the Supabase project dies with it too. There is no third copy and no way to regenerate one. |

## The two files, and why there are two

`SPEC.md` §8 named a single `fixtures/tvtracker-export.sql.gz`. The export is actually two
halves and **both are needed**, so both are here:

| File | What it holds | Altered? |
| --- | --- | --- |
| `tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz` | Row data — `INSERT` statements only | **Yes.** See below. |
| `tvtracker-2026-08-16T04-27-53Z-schema.sql.gz` | `CREATE TABLE`, constraints, indexes, RLS policies, the `set_updated_at` trigger function | No — byte-for-byte the dump |

The data half alone cannot be read without the schema half: it is `INSERT INTO … VALUES`
with no column types and no constraints, so the shape of what was exported — which column
is `watched_through`, what `legacy` was, which fields were nullable — lives only in the
schema file.

## What was removed, and why

The data half **is not byte-identical to the dump**, and the filename says `.redacted` so
that this can never be discovered by surprise. An archive labelled *source of truth* that
has been quietly altered is worse than one that names its alteration.

Removed: **every `INSERT` into the `auth` schema — 6 statements, 17 rows.**

| Table | Rows removed | What they were |
| --- | --- | --- |
| `auth.users` | 2 | Both accounts, with email addresses and password hash columns |
| `auth.identities` | 2 | Google OAuth identity records, including `identity_data` JSON |
| `auth.sessions` | 2 | Live sessions |
| `auth.refresh_tokens` | 7 | **Live refresh tokens** |
| `auth.flow_state` | 2 | In-flight PKCE auth codes and code verifiers |
| `auth.mfa_amr_claims` | 2 | Authentication-method claims bound to those sessions |

Because committing them would put **working credentials and two real people's email
addresses into this repository's git history permanently**, where deleting them later does
not remove them. They also serve no purpose: the step 3 conversion script reads `shows` and
`episode_overrides` and nothing else, MediaSafe's auth is Better Auth against Neon, and
[#16](https://github.com/Joyaroin/MediaSafe/issues/16) already drops `tvtracker`'s test
account.

Each removed statement is replaced **in place** by a comment naming the table and the row
count, so the archive states its own gaps:

```sql
-- REDACTED — auth.refresh_tokens: 7 row(s) removed before committing to MediaSafe.
-- See fixtures/README.md (MediaSafe issue #60).
```

**Nothing else was touched.** The redaction removed exactly those 6 byte ranges — 8,650
bytes — and the remaining content was verified byte-identical to the original before
compressing.

### What was deliberately kept

Recorded because *not* removing something is as much a decision as removing it:

- **`SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 124, true);`** — an `auth`
  statement that survived. It is a sequence position, not a row and not a credential; the
  number `124` is all it discloses. Minimal alteration beat tidiness.
- **The `-- \restrict …` / `-- \unrestrict …` token** at the top and bottom. A `pg_dump`
  17.6 psql-parser guard, regenerated per dump. Not a secret.
- **The schema half, entirely unmodified.** It declares no `auth` object and holds no
  credential — it only *references* `auth.users` in four foreign keys and `auth.uid()` in
  the RLS policies. That is structure, and structure is the point of the file.
- **A second account's rows in `public`.** See the warning below.

## What is actually in it

| Table | Rows |
| --- | --- |
| `public.shows` | **472** |
| `public.episode_overrides` | **18,649** |
| `public.movies`, `public.lists`, `public.list_items`, `public.watch_events` | 0 — all empty |
| `storage.*` | 0 — all empty |

`watch_events` being empty is not a dump error. `tvtracker`'s ADR-0003 called events
canonical and nothing ever wrote one; the watch history lives entirely in
`episode_overrides` and in the `shows.watched_through` / `watched_count` columns. **The
conversion script must read those, not `watch_events`.**

### ⚠️ The 472 are not all one person's

| Account | `shows` | `episode_overrides` |
| --- | --- | --- |
| `21cbd8c5-…` (Adham) | **462** | 18,642 |
| a second account | 10 | 7 |

This resolves what looked like a contradiction between documents: **472 is the table total,
462 is Adham's**, and `SPEC.md` §8's "462 titles" for the seed was right all along — it
already assumes the filter.

**So step 3's conversion script must filter to `21cbd8c5-…` when producing
`fixtures/mediasafe-seed.json`.** [#18](https://github.com/Joyaroin/MediaSafe/issues/18)
decided that **no environment outside production ever holds another person's rows**, and
that seed is what populates every preview and every local Docker database. An unfiltered
conversion would put a second person's viewing history into all of them, which is exactly
the outcome #18 rejected — and it would do so silently, because 472 rows look no more
wrong than 462.

The rows stay in *this* archive rather than being stripped, because the archive's job is to
be the faithful record of what the database held, and because the redaction above already
removed the only thing that tied them to a person: with `auth.users` and `auth.identities`
gone, what remains is an opaque UUID against ten programme titles. Filtering is step 3's
job and it is a live requirement there, not a decision already taken here.

## Integrity

Checksums are of the **decompressed** SQL, not the `.gz`. gzip output varies with the
compressor, so hashing the container would flag a difference that does not exist in the
data; the payload is the irreplaceable thing, so the payload is what is pinned.
`tests/fixture-archive.test.ts` asserts these on every run.

| | sha256 |
| --- | --- |
| `…-data.redacted.sql` (as committed) | `f12954041a76c1ee2af407ba912374c4c7f48d810f56967a3e1f90eff97a4716` |
| `…-schema.sql` (as committed) | `80c2c941619d9daba628ea8233c5c400ee880d2f83467001ffe605e33e429314` |

For provenance against the source repository while it still exists:

| | sha256 |
| --- | --- |
| Original `…-data.sql` **before** redaction | `190509793dc7ea61e230a604e49588c7228c040a980b55d68cdbcbcfc85319d9` |
| Original `…-data.sql.gz` in `tvtracker` | `20aa8a4f52a9b4a421833a62dc2bd7fa9a1dc1d2b758ce9c0b2699d6e5ad0ea3` |
| `…-schema.sql.gz` in `tvtracker` | `851a0f81082e285a2dcc537b70c08ad568ef327df10cdf22412f1a29d03b1865` |

The schema `.gz` is committed here **byte-for-byte**, so that last hash is also the hash of
the file in this directory — the two repositories can be compared directly for as long as
both exist.

To read either archive without loading it anywhere:

```sh
gzcat fixtures/tvtracker-2026-08-16T04-27-53Z-schema.sql.gz | less
```

## Still outstanding

**`fixtures/mediasafe-seed.json` is not here yet, and that is expected.** `SPEC.md` §8 step
0 commits the raw export now and the seed when the script that derives it exists — the
conversion script is **step 3**, and the raw export was the irreplaceable half. The seed is
reproducible from what is in this directory for as long as this directory exists; the
export was not reproducible from anything.

When step 3 lands, that script is the **first and only** thing permitted to read these
files, and `tests/fixture-archive.test.ts` will fail at that moment by design — the archive
stops being never-loaded exactly then, and it should take a visible diff to say so.
