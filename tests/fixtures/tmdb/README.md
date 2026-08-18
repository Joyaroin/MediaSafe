# Captured TMDB responses

The fixtures the mirror mapping is tested against (`tests/tmdb-mirror.test.ts`).

**Where they came from.** They are TMDB's own published example responses for
`/search/multi`, `/movie/{id}`, `/tv/{id}` and `/tv/{id}/season/{n}`, taken from the API
reference at `developer.themoviedb.org` and trimmed only by *removing whole results and
whole episodes* — never by removing a field from a result or an episode that was kept.
That distinction is the point of these files: the mapping's job is to write the mirrored
fields **and no others** (ADR-0001, Metadata caching policy), and a fixture with
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
