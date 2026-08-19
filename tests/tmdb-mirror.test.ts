import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  catalogueResults,
  filmMirror,
  seasonNumbers,
  showMirror,
  type TmdbMoviePayload,
  type TmdbSearchPayload,
  type TmdbSeasonPayload,
  type TmdbShowPayload,
} from "@/tmdb/mirror";

/**
 * The TMDB response → mirror rows mapping, against captured responses.
 *
 * ── Why this one is tested when almost nothing else is ───────────────────────────────
 *
 * `SPEC.md` §6 names four tests that earn their keep and says everything else "fails
 * loudly and cheaply to an app used daily by its owner". That argument does not reach
 * this function, and the reason is ADR-0001's second split: **`title` and `episode` are
 * global and unowned.** One account adding a show writes rows every other account then
 * reads. The mapping is not one person's data path — it is shared infrastructure — so
 * "its owner will notice" is not the safety net it is everywhere else in this codebase.
 *
 * It is also the whole reason the mapping is a pure function rather than the natural
 * inline fetch-and-insert: a shape that cannot be tested without a network and a database
 * would not be tested, and this is the one write in build step 2 where that matters.
 *
 * ── What is deliberately not tested, and where it lives ──────────────────────────────
 *
 * **The HTTP call.** `tmdb/catalogue.ts` builds four URLs, sets a bearer header, and hands
 * the parsed bodies to the functions below. There is no assertion in this file that
 * touches it and that is a decision, not an omission: a test of it is a test of `fetch`
 * and of a mock of TMDB, and a mock of TMDB that drifts from TMDB is worse than no test,
 * because it goes green while production goes wrong. What can drift silently is the
 * mapping, and that is what these fixtures pin.
 *
 * ── The fixtures ─────────────────────────────────────────────────────────────────────
 *
 * `tests/fixtures/tmdb/README.md` says where they came from and what was and was not
 * trimmed. The one property to preserve when replacing them with live captures: the
 * results and episodes kept must keep **every** field TMDB sent, including the ones
 * ADR-0001 says are fetched live and never stored. `writesOnlyMirroredFields` below reads
 * the output looking for them, and it can only pass meaningfully if they were in the
 * input.
 */

function fixture<T>(name: string): T {
  const file = path.join(import.meta.dirname, "fixtures", "tmdb", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const searchPayload = fixture<TmdbSearchPayload>("search-multi");
const moviePayload = fixture<TmdbMoviePayload>("movie-details");
const showPayload = fixture<TmdbShowPayload>("tv-details");
const seasonPayloads = [
  fixture<TmdbSeasonPayload>("tv-season-0"),
  fixture<TmdbSeasonPayload>("tv-season-1"),
  fixture<TmdbSeasonPayload>("tv-season-2"),
];

/**
 * The field names ADR-0001's caching policy puts on the **live** side of the line, plus
 * the ones TMDB sends that nothing in MediaSafe has a column for.
 *
 * Asserted against the mapping's *output*, recursively, rather than against a list of
 * expected keys — an expected-keys assertion tells you the shape is right, and this tells
 * you nothing borrowed leaked into it. Both are here, because they fail on different bugs.
 */
const NEVER_STORED = [
  "overview",
  "synopsis",
  "tagline",
  "backdrop_path",
  "still_path",
  "credits",
  "cast",
  "crew",
  "guest_stars",
  "created_by",
  "watch/providers",
  "providers",
  "genres",
  "genre_ids",
  "vote_average",
  "vote_count",
  "popularity",
  "homepage",
  "production_companies",
  "budget",
  "revenue",
  /**
   * `append_to_response=external_ids` brings eight more ids along with the one that is
   * mirrored. None of them is a catalogue a title could be looked up in, so none of them
   * is on the left-hand side of ADR-0001's line — and the object itself is not stored
   * either, only the one string derived from it.
   */
  "external_ids",
  "freebase_mid",
  "freebase_id",
  "tvrage_id",
  "wikidata_id",
  "facebook_id",
  "instagram_id",
  "twitter_id",
];

/** Every key appearing anywhere in `value`, at any depth. */
function keysAnywhere(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const element of value) keysAnywhere(element, found);
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      keysAnywhere(nested, found);
    }
  }
  return found;
}

describe("catalogueResults", () => {
  const results = catalogueResults(searchPayload);

  it("returns films and shows from one search", () => {
    expect(results.map((result) => result.kind)).toContain("film");
    expect(results.map((result) => result.kind)).toContain("show");
  });

  it("drops people, which /search/multi mixes in with titles", () => {
    // The fixture's person result is Mark Hamill, whose `known_for` carries a film. A
    // mapping that walked into it would return Star Wars twice.
    expect(results.filter((result) => result.name === "Mark Hamill")).toHaveLength(0);
    expect(results.filter((result) => result.tmdbId === 11)).toHaveLength(1);
  });

  it("reads a film's name from `title` and its year from `release_date`", () => {
    expect(results.find((result) => result.kind === "film")).toEqual({
      kind: "film",
      tmdbId: 11,
      name: "Star Wars",
      releaseYear: 1977,
      posterPath: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
    });
  });

  it("reads a show's name from `name` and its year from `first_air_date`", () => {
    expect(results.find((result) => result.tmdbId === 1399)).toEqual({
      kind: "show",
      tmdbId: 1399,
      name: "Game of Thrones",
      releaseYear: 2011,
      posterPath: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    });
  });

  it("reads TMDB's empty-string date as no year, not as year zero", () => {
    // `first_air_date: ""` is how TMDB spells "undated", and `Number("")` is 0.
    expect(results.find((result) => result.tmdbId === 289283)).toEqual({
      kind: "show",
      tmdbId: 289283,
      name: "Star Wars: Andor - Season 3",
      releaseYear: null,
      posterPath: null,
    });
  });

  it("returns one row per catalogue key when TMDB repeats a result", () => {
    // `catalogueKeyOf` is the React key of the result list *and* the key of the
    // already-in-your-library set. A repeat would render one title twice with colliding
    // keys, and adding one copy would leave the other still offering to add it.
    const repeated = catalogueResults({
      results: [
        ...(searchPayload.results ?? []),
        (searchPayload.results ?? [])[0],
      ],
    });
    expect(repeated).toEqual(results);
  });

  it("keeps TMDB's relevance order", () => {
    // TMDB ranked these; nothing here re-ranks them, and the dedupe above keeps the
    // first — highest-ranked — appearance rather than the last.
    expect(results.map((result) => result.tmdbId)).toEqual([1399, 11, 289283]);
  });

  it("carries nothing that is fetched live and never stored", () => {
    const keys = keysAnywhere(results);
    for (const forbidden of NEVER_STORED) expect(keys).not.toContain(forbidden);
  });

  it("returns nothing for a response that matched nothing", () => {
    // Zero results is a successful search that found nothing, and it is reachable only
    // this way: `catalogueResults` has no failure path that produces an empty array
    // (SPEC.md §3.2). The search screen's four states rest on that.
    expect(catalogueResults({ page: 1, results: [], total_results: 0 })).toEqual([]);
  });
});

describe("filmMirror", () => {
  const film = filmMirror(moviePayload);

  it("mirrors exactly the fields ADR-0001 lists, and no others", () => {
    expect(film).toEqual({
      kind: "film",
      tmdbId: 11,
      name: "Star Wars",
      releaseYear: 1977,
      posterPath: "/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
      // `/movie/{id}` carries `imdb_id` itself. A film has no TVDB id to fall back to,
      // so this branch is the only one a film can take.
      externalId: "imdb:tt0076759",
      // Shows only. A film with `in_production` set would be a film with a column that
      // means nothing about it.
      inProduction: null,
      runtimeMins: 121,
      episodes: [],
    });
  });

  it("carries nothing that is fetched live and never stored", () => {
    const keys = keysAnywhere(film);
    for (const forbidden of NEVER_STORED) expect(keys).not.toContain(forbidden);
  });

  it("leaves the external id absent where TMDB has none", () => {
    // The accepted case, and the reason the column is nullable: a title with nothing to
    // be re-found by is still a perfectly valid row. It is never invented.
    expect(filmMirror({ id: 11, title: "Star Wars" }).externalId).toBeNull();
  });

  it("reads TMDB's empty-string IMDb id as absent, not as an id", () => {
    // The same `""`-for-nothing habit `release_date` has, on a column whose whole job is
    // to be handed back to TMDB as a lookup key.
    expect(
      filmMirror({ id: 11, title: "Star Wars", imdb_id: "" }).externalId,
    ).toBeNull();
  });

  it("throws rather than mirroring a title with no name", () => {
    // `title.name` is NOT NULL, and this row is global — a placeholder written here is a
    // placeholder every account reads. Loud beats a row nobody can explain later.
    expect(() => filmMirror({ id: 11 })).toThrow(/name/i);
  });

  it("throws rather than mirroring a title with no TMDB id", () => {
    expect(() => filmMirror({ title: "Star Wars" })).toThrow(/id/i);
  });
});

describe("seasonNumbers", () => {
  it("lists the seasons to fetch, specials included, in order", () => {
    // Season 0 is mirrored and markable (ADR-0001); it is only excluded from the derived
    // states, which is `db/views.ts`'s job and not this one's.
    expect(seasonNumbers(showPayload)).toEqual([0, 1, 2]);
  });

  it("is empty for a payload with no seasons at all", () => {
    expect(seasonNumbers({ id: 1399, name: "Game of Thrones" })).toEqual([]);
  });
});

describe("showMirror", () => {
  const show = showMirror(showPayload, seasonPayloads);

  it("mirrors the show's own fields, and leaves the film-only one null", () => {
    expect(show.kind).toBe("show");
    expect(show.tmdbId).toBe(1399);
    expect(show.name).toBe("Game of Thrones");
    expect(show.releaseYear).toBe(2011);
    expect(show.posterPath).toBe("/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg");
    expect(show.inProduction).toBe(false);
    // IMDb where TMDB has one — and TMDB has one for this show alongside a TVDB id, so
    // this is also the assertion that the two are not both stored and not concatenated.
    expect(show.externalId).toBe("imdb:tt0944947");
    // Films only. `episode_run_time` is a per-episode average and is not this column.
    expect(show.runtimeMins).toBeNull();
  });

  it("brings every season's episodes into the mirror, names included", () => {
    // The acceptance criterion, and CONTEXT.md's rule behind it: an episode is never
    // referred to by number alone, which makes the name load-bearing on ordinary list
    // screens rather than a detail-page nicety.
    expect(show.episodes).toHaveLength(7);
    expect(show.episodes.map((episode) => episode.name)).toEqual([
      "Inside Game of Thrones",
      "Character Feature - Tyrion Lannister",
      "Winter Is Coming",
      "The Kingsroad",
      "Lord Snow",
      "The North Remembers",
      "The Night Lands",
    ]);
  });

  it("mirrors one episode's every stored field and nothing else", () => {
    expect(show.episodes[2]).toEqual({
      tmdbEpisodeId: 63056,
      seasonNo: 1,
      episodeNo: 1,
      name: "Winter Is Coming",
      airDate: "2011-04-17",
      runtimeMins: 62,
    });
  });

  it("keeps specials, at season 0", () => {
    expect(show.episodes.filter((episode) => episode.seasonNo === 0)).toHaveLength(2);
  });

  it("reads an undated episode and an untimed one as absent, not as zero", () => {
    const undated = show.episodes.find((episode) => episode.tmdbEpisodeId === 977213);
    expect(undated?.airDate).toBeNull();
    expect(undated?.runtimeMins).toBeNull();
  });

  it("orders episodes by season and then by number", () => {
    const order = show.episodes.map((episode) => [episode.seasonNo, episode.episodeNo]);
    expect(order).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
    ]);
  });

  it("orders episodes the same way whatever order the seasons arrive in", () => {
    // The seasons are fetched concurrently, so the order they come back in is the order
    // the network happened to answer. A mirror that depended on it would write different
    // rows on different days.
    const shuffled = showMirror(showPayload, [
      seasonPayloads[2],
      seasonPayloads[0],
      seasonPayloads[1],
    ]);
    expect(shuffled).toEqual(show);
  });

  it("writes one row per TMDB episode id when TMDB repeats one", () => {
    // `UNIQUE (tmdb_episode_id)` — a duplicate in the payload is an insert that aborts
    // the whole add, and TMDB does occasionally list an episode in two seasons.
    const duplicated = showMirror(showPayload, [...seasonPayloads, seasonPayloads[1]]);
    expect(duplicated.episodes).toHaveLength(7);
    expect(duplicated).toEqual(show);
  });

  it("carries nothing that is fetched live and never stored", () => {
    const keys = keysAnywhere(show);
    for (const forbidden of NEVER_STORED) expect(keys).not.toContain(forbidden);
  });

  it("mirrors a show TMDB has no episode data for, with no episodes", () => {
    // A real state, and `docs/design/v1-surfaces.md` §6 names it on title detail. It is
    // an empty list, not a failure, and it must not become one here.
    const bare = showMirror({ id: 1399, name: "Game of Thrones" }, []);
    expect(bare.episodes).toEqual([]);
    expect(bare.name).toBe("Game of Thrones");
  });

  it("throws rather than mirroring a show with no name", () => {
    expect(() => showMirror({ id: 1399 }, [])).toThrow(/name/i);
  });

  it("falls back to TVDB where TMDB has no IMDb id for a show", () => {
    // TVDB is the *otherwise* half of the rule, and the reason the source is written
    // into the value: the lookup that reads this has to name which catalogue it is.
    const noImdb = showMirror(
      { ...showPayload, external_ids: { imdb_id: null, tvdb_id: 121361 } },
      [],
    );
    expect(noImdb.externalId).toBe("tvdb:121361");
  });

  it("leaves the external id absent where TMDB has neither", () => {
    expect(
      showMirror({ ...showPayload, external_ids: { tvdb_id: 0 } }, []).externalId,
    ).toBeNull();
  });

  it("mirrors no external id from a show fetched without the append", () => {
    // Not a failure mode this file can prevent — `SHOW_APPEND_TO_RESPONSE` is what keeps
    // the two fetchers asking for it. Pinned so the behaviour is *stated*: the column
    // stays null and looks exactly like a show TMDB has no external id for.
    expect(showMirror({ id: 1399, name: "Game of Thrones" }, []).externalId).toBeNull();
  });

  it("refuses an external id it could not look a title up by", () => {
    // A row that claims a handle exists is worse than one that claims nothing: the thing
    // that will read this column repoints a global title on the strength of it.
    expect(
      showMirror({ ...showPayload, external_ids: { imdb_id: "nm0000206" } }, [])
        .externalId,
    ).toBeNull();
    expect(
      showMirror({ ...showPayload, external_ids: { imdb_id: "121361" } }, []).externalId,
    ).toBeNull();
  });

  it("drops an episode with no TMDB id rather than writing a row keyed by nothing", () => {
    const withBrokenEpisode: TmdbSeasonPayload = {
      season_number: 1,
      episodes: [{ episode_number: 4, season_number: 1, name: "Cripples, Bastards" }],
    };
    expect(showMirror(showPayload, [withBrokenEpisode]).episodes).toEqual([]);
  });
});
