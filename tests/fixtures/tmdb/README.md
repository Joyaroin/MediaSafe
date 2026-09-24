# Captured TMDB responses

The fixtures the mirror mapping is tested against (`tests/tmdb-mirror.test.ts`).

**Where they came from.** They are TMDB's own published example responses for
`/search/multi`, `/movie/{id}`, `/tv/{id}` and `/tv/{id}/season/{n}`, taken from the API
reference at `developer.themoviedb.org` and trimmed only by *removing whole results and
whole episodes* — never by removing a field from a result or an episode that was kept.
That distinction is the point of these files: the mapping's job is to write the mirrored
fields **and no others** (the metadata caching policy), and a fixture with
`overview`, `backdrop_path`, `vote_average`, `credits` and `watch/providers` pruned out
of it could not prove that the mapping ignores them.

**They are not captured against this repository's own key**, because no TMDB key is
provisioned yet — `.env.example` gains `TMDB_READ_ACCESS_TOKEN` in the same change that
adds these. Replacing a file here with a live capture of the same endpoint is a drop-in
when a key exists: the tests read the JSON off disk and assert on the mapping's output,
and none of them depends on a particular title.

**Three things are deliberately awkward here**, because TMDB really does send them and
the mapping has to survive all three:

- `air_date` and `first_air_date` arrive as `""` rather than `null` for undated entries.
- `runtime` arrives as `null` on episodes TMDB has no timing for.
- `/search/multi` returns `media_type: "person"` results mixed in with films and shows.

## `external_ids` on `tv-details.json`

`tv-details.json` is a capture of `/tv/{id}?append_to_response=external_ids`, not of a bare
`/tv/{id}` — that append is how the show half of `title.external_id` arrives, and the
constant naming it is `SHOW_EXTERNAL_IDS_APPEND` in `tmdb/mirror.ts`. The `external_ids`
block was added by hand to TMDB's published example response, in TMDB's own documented
shape for that endpoint. Two of the nine ids in it are the ones the mapping may read —
`imdb_id`, and `tvdb_id` as the fallback. **The other seven are the point of keeping the
block whole**: `freebase_mid`, `freebase_id`, `tvrage_id`, `wikidata_id`, `facebook_id`,
`instagram_id` and `twitter_id` are all in `NEVER_STORED`, so the fixture is what proves
the mapping takes one id out of that object and leaves the social handles where it found
them. Trimming them would make that assertion vacuous, exactly as trimming `overview`
would.

The film side needs no append: `/movie/{id}` carries `imdb_id` at the top level, and
`movie-details.json` already had it — `tt0076759`, unedited.

Two branches no single capture can hold at once, so they are built inline in
`tests/tmdb-mirror.test.ts` from `showPayload` rather than kept as files: a show TMDB has
a TVDB id but no IMDb id for, and a show it has neither for.

## The `/find` fixtures

`find-tvdb-show.json`, `find-tvdb-ambiguous.json`, `find-none.json` and `find-imdb-film.json` back
`tests/tmdb-reconcile.test.ts` — the decision one 404'd title reaches (issue #116). Like the
live-facts files below, **these are hand-built to TMDB's documented response shape** for
`/find/{external_id}?external_source=`, not live captures; no TMDB key is reachable from this
environment. Replace them with live captures the same way.

The four branches they hold, which is the whole decision:

- **`find-tvdb-show.json`** — exactly one surviving show, so the title is repointed.
- **`find-tvdb-ambiguous.json`** — two shows under one TVDB id, which is what an unresolved TMDB
  duplicate looks like. Never a pick.
- **`find-none.json`** — all five lists empty. The id is gone from TMDB and from the catalogue it
  borrowed, and there is nothing to reconcile to.
- **`find-imdb-film.json`** — the film half, read out of `movie_results`. Its TMDB id and IMDb id
  match `movie-details.json` above, so the two fixtures describe one title.

**Keep the results whole, and keep the lists that are not titles.** Two properties depend on it,
and both are assertions in the test file rather than claims:

- The kept `tv_results` entry carries `name`, `original_name`, `first_air_date`, `overview`,
  `poster_path`, `popularity` and `vote_average`. **Name-and-year search is the one thing this path
  may never do**, and `tmdb/reconcile.ts` declines to even *declare* those fields — a fixture with
  them trimmed out could not show that the decision ignores what it was handed.
- `find-tvdb-show.json` also carries a `person_results` entry and a `tv_episode_results` entry, each
  with an id of its own. A person, an episode and a season are not titles, and a decision that
  counted them would find three survivors where TMDB published one.

## The live-facts fixtures

`movie-credits.json`, `tv-credits.json`, `movie-watch-providers.json` and
`tv-watch-providers.json` back `tests/tmdb-live-facts.test.ts` — the mapping in
`tmdb/live-facts.ts` for the fields fetched live and never stored. Unlike the
four mirror captures at the top of this file, **these are hand-built to TMDB's documented response shape** for
`/movie/{id}/credits`, `/tv/{id}/credits` and `/movie|tv/{id}/watch/providers`, not a live
capture — no TMDB key is reachable from this environment. They deliberately carry the
same awkward cases the mapping has to survive: a cast or crew member missing a name, an
empty `character`, one person credited under two jobs, a `rent`/`buy` bucket the mapping
must ignore, a region with no `flatrate`, and a provider with no name. Replace them with a
live capture the same way the four above would be replaced — the tests read JSON off disk
and assert on the mapping's output.
