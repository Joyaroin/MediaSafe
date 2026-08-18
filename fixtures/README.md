# The `tvtracker` rescue archive

**This is the only surviving copy of `tvtracker`'s database.** Nothing in the application,
the seeding path or the read paths touches it. **Two files may read it, and they are named
in an allowlist** — the step 3 conversion and its test:

```
scripts/convert-tvtracker/cli.ts       ← reads the archive, writes the seed fixture
tests/tvtracker-conversion.test.ts     ← SPEC.md §6's test 1, which reads it by definition
```

Until [#71](https://github.com/Joyaroin/MediaSafe/issues/71) this section said *archived
and never loaded*, and the paragraph at the bottom of this file predicted the day that
would end. It ended there: the conversion mapping is the thing the archive was rescued
for, and the archive stops being never-loaded exactly when it is read. What changed is the
expected result, not the check.

`tests/fixture-archive.test.ts` holds that allowlist, and **CI runs it on every pull
request** — `npm run test:fixtures`, which needs neither the database nor the build, unlike
most of this repo's suite. A guarantee that only held when somebody happened to run the
full local suite would be a habit rather than a check.

It is worth knowing how far the guard reaches: it fails if any tracked, executable file
outside that allowlist **names** either archive — including one placed in this directory.
A loader that never spells the filename — `readdirSync("fixtures")`, a glob, a name
rebuilt from the timestamp — would slip past it. It is a tripwire on the obvious way in,
not a proof.

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
| `storage.*` (7 tables) | 0 — all empty |

Every count above is checkable against the data half alone. `pg_dump` emits a
`-- Data for Name: <table>; Type: TABLE DATA; Schema: <schema>` header for every table it
exported, including the empty ones, and writes no `INSERT` beneath an empty one — so the
zero rows are as visible as the non-zero ones. The `storage.*` figure in particular cannot
be checked against the schema half, which declares no `storage` object at all:

```sh
gzcat fixtures/tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz | grep 'Data for Name:'
```

`watch_events` being empty is not a dump error. `tvtracker`'s ADR-0003 called events
canonical and nothing ever wrote one, so **the conversion reads `shows` and
`episode_overrides`, never `watch_events`.**

**But those are not the whole record, and this line used to say they were.** Which episodes
were watched lives in `episode_overrides` and the `shows.watched_through` watermark; *when*
and *how many times* lives only in **`shows.legacy`**, the TV Time blob the v2 import
preserved. See *`shows.legacy` is watch history* below — reading only the first two costs
19,678 dates and every rewatch.

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

## What has been read out of it so far

**The conversion landed in [#71](https://github.com/Joyaroin/MediaSafe/issues/71) and was run
in [#61](https://github.com/Joyaroin/MediaSafe/issues/61)**, which is what retired the
prediction this section used to carry — *"when step 3 lands, that script is the first and
only thing permitted to read these files, and `tests/fixture-archive.test.ts` will fail at
that moment by design"*. That happened, and the allowlist at the top of this file replaced
the tripwire.

`fixtures/mediasafe-seed.json` is now committed. What it holds, measured rather than
quoted:

| | |
| --- | --- |
| Titles | **462** — the account filter, asserted as a set and not only as a count |
| Watches | **19,558** |
| …carrying a real date | **19,391** |
| …that are rewatches (`:2` and up) | **1,156** |
| Titles marked abandoned | **155** — 65 `Paused` + 90 short `Completed` |
| Titles with no watches | **23** — watchlist entries, and they survive into the file |
| Size | **2.75 MB** |

### ⚠️ `shows.legacy` is watch history, not only borrowed metadata

The single most consequential thing found in this archive, and it was found late. **456 of
the 462 titles were imported from TV Time**, and `tvtracker` kept the whole TV Time record
in `shows.legacy` — including two things its own v3 tables threw away:

- **`episodeWatchDates` — 19,678 per-episode timestamps across 455 titles**, 4,343 of them
  distinct, spanning 2021-07-26 to 2026-07-09, with **none** inside the 2026-08-03 import
  window. They are viewing history, not stamps.
- **`episodeRewatchCounts` and repeated dates — 1,209 episodes watched more than once.**
  `len(dates) == rewatchCount + 1` holds for 18,423 of 18,443 episodes, so the two records
  corroborate each other.

`SPEC.md` §7 says *"18 watches are dated — the only genuine `last_watched_at` values in the
library"* and *"`source_key` … always `:1` in this file"*; #16 says *"there is no rewatch
data in the library, and there never was."* **All three were reached from the v3 tables
without opening `legacy`, and all three are wrong.** Following them would have discarded
~19,600 real dates and every rewatch — which is the loss this archive was rescued to
prevent.

The blob also holds `title`, `posterPath`, `overview` and TMDB match bookkeeping. None of
it is read: `parse.ts` takes four fields, and every one is a fact about the viewer.

### TV Time numbers seasons differently from TMDB

`tvtracker` kept TV Time's `s{n}e{n}` keys, and TMDB does not always agree with them — it
merges seasons TV Time split (Hunter x Hunter's *season 2* is the back half of TMDB's single
148-episode season) and splits episodes TV Time merged (The Office records 195 against
TMDB's 186). **330 recorded watches across 44 shows named an episode TMDB does not list.**

Two rules resolve 159 of them without inferring anything:

- a title with as many recorded episodes as it has was **watched right through**, so every
  episode TMDB lists gets a watch — true however the two catalogues number their seasons;
- a leftover on a title that already holds every episode TMDB lists is **one half of a
  two-part episode**, already counted.

The remaining **171 across 20 titles** are accepted by name in
`scripts/convert-tvtracker/convert.confirm.json`, each with its exact count so that a
re-export whose numbers differ stops the script. Ordinal mapping was considered and
rejected: it needs TV Time's complete season lengths, which the export does not record —
it holds only the episodes that were interacted with — so it would place watches on
episodes that were never watched, undetectably.

### The day-one split this file implies

| | this file | `SPEC.md` §7 |
| --- | --- | --- |
| watching | 63 | 62 |
| abandoned | **155** | 155 |
| finished-or-caught-up | 221 | 223 |
| watchlist | 23 | 22 |

#61 asks that this file's actual output settle such discrepancies, so it does. The deltas
are the dropped rows above: `given`'s only record was an `S1E0` placeholder, which is not an
episode, so it lands on the watchlist. The split remains a **cutover check** against a real
import, not a CI test.
