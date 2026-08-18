# Native import format sample

A hand-written, test-only fixture for `import/native-format.ts` (issue #69) and the
tickets it unblocks — **it is not `fixtures/mediasafe-seed.json`**, which is #74's real
462-title conversion of Adham's library and lives in `fixtures/`, not `tests/`.

`sample.json` covers, deliberately, in one small file:

- **a title with no watches** — `1416` (Grey's Anatomy), a plain watchlist entry, because
  21 real titles are exactly that.
- **an abandoned title** — `94605` (Loki), `abandoned: true`, with one watch: giving up on
  a show usually happens after watching some of it.
- **a season-0 watch** — `1399` (Game of Thrones) episode `63072`, a real TMDB special,
  reused from `tests/fixtures/tmdb/tv-season-0.json` so the two fixtures agree.
- **a dated watch** — the same show's episode `63056`, `watched_at` set, alongside the
  undated watches every other entry carries.

The `tmdb_id`s and `tmdb_episode_id`s are real TMDB ids, chosen to match
`tests/fixtures/tmdb/*.json` where they overlap, but this fixture is never resolved
against TMDB — `import/native-format.ts` validates shape only.
