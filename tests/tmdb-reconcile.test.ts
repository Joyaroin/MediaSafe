import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { EpisodeMirror, ExternalId, TitleMirror } from "@/tmdb/mirror";
import {
  findRequestFor,
  reconcileByExternalId,
  reconcileEpisodes,
  type Repoint,
  type TmdbFindPayload,
} from "@/tmdb/reconcile";

/**
 * The decision one 404'd title reaches, against captured `/find` responses (issue #116).
 *
 * ── Why this one is tested, when almost nothing else is ──────────────────────────────
 *
 * The same argument `tests/tmdb-mirror.test.ts` makes, one degree sharper. `title` and
 * `episode` are global and unowned (ADR-0001), so a wrong answer here is not one person's
 * problem — **one wrong match is everyone's wrong match**, and it looks exactly like a
 * correct one. It is also reached only at night, by a cron nobody is watching, on a title
 * that already vanished upstream: there is no screen it renders on and no reader it
 * surprises. `SPEC.md` §6's "fails loudly and cheaply to an app used daily by its owner"
 * is not available as a safety net for any part of this.
 *
 * So the decision is a pure function with the network and the database on the other side
 * of it, and this file is where every branch of it is pinned. `tests/title-
 * reconciliation.test.ts` covers the writes that follow a decision; nothing here touches
 * Postgres or TMDB.
 *
 * ── The fixtures ─────────────────────────────────────────────────────────────────────
 *
 * `tests/fixtures/tmdb/README.md` says where they came from. The property to preserve
 * when replacing them with live captures is the one the mirror fixtures already keep:
 * **every field TMDB sent on a result that was kept.** `readsNothingButIds` below is only
 * meaningful because the results carry `name`, `overview`, `first_air_date` and the rest —
 * a name-and-year search is the thing this path may never do, and the fixture is what
 * makes "it did not" an assertion rather than a claim.
 */

function fixture<T>(name: string): T {
  const file = path.join(import.meta.dirname, "fixtures", "tmdb", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** One surviving show — `tvdb:81189` still resolves, to TMDB show 1396. */
const oneShow = fixture<TmdbFindPayload>("find-tvdb-show");
/** Two shows under one TVDB id: the duplicate TMDB has not resolved. */
const twoShows = fixture<TmdbFindPayload>("find-tvdb-ambiguous");
/** Every list empty — the id is gone from TMDB and from the catalogue it borrowed. */
const nothing = fixture<TmdbFindPayload>("find-none");
/** One surviving film — `imdb:tt0076759` still resolves, to TMDB film 11. */
const oneFilm = fixture<TmdbFindPayload>("find-imdb-film");

const TVDB: ExternalId = "tvdb:81189";
const IMDB: ExternalId = "imdb:tt0076759";

/** The show that 404'd, in every show case below. Not 1396 — that is what survived. */
const GONE = 1400;

function episodeMirror(tmdbEpisodeId: number): EpisodeMirror {
  return {
    tmdbEpisodeId,
    seasonNo: 1,
    episodeNo: tmdbEpisodeId - 62_084,
    name: `Episode ${tmdbEpisodeId}`,
    airDate: "2008-01-20",
    runtimeMins: 58,
  };
}

function survivorMirror(episodes: readonly EpisodeMirror[]): TitleMirror {
  return {
    kind: "show",
    tmdbId: 1396,
    externalId: TVDB,
    name: "Breaking Bad",
    releaseYear: 2008,
    posterPath: null,
    inProduction: false,
    runtimeMins: null,
    episodes,
  };
}

const repointTo1396: Repoint = { outcome: "repoint", toTmdbId: 1396, evidence: TVDB };

describe("findRequestFor", () => {
  it("hands TMDB the source it needs alongside the id", () => {
    expect(findRequestFor(TVDB)).toEqual({ externalSource: "tvdb_id", id: "81189" });
    expect(findRequestFor(IMDB)).toEqual({ externalSource: "imdb_id", id: "tt0076759" });
  });
});

describe("reconcileByExternalId", () => {
  it("repoints a show to the one id its external id still resolves to", () => {
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: oneShow }),
    ).toEqual({ outcome: "repoint", toTmdbId: 1396, evidence: TVDB });
  });

  it("repoints a film the same way, from the film half of the response", () => {
    expect(
      reconcileByExternalId("film", 12, { externalId: IMDB, find: oneFilm }),
    ).toEqual({ outcome: "repoint", toTmdbId: 11, evidence: IMDB });
  });

  it("quarantines a title with no external id stored, without a lookup to make", () => {
    // The `find` payload is not merely unused here — it is unrepresentable. There is no
    // second argument this branch could have been given a search result in.
    expect(reconcileByExternalId("show", GONE, { externalId: null })).toEqual({
      outcome: "quarantine",
      reason: "no-external-id",
    });
  });

  it("quarantines when the lookup returns nothing", () => {
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: nothing }),
    ).toEqual({ outcome: "quarantine", reason: "no-surviving-id" });
  });

  it("quarantines when the lookup returns more than one, rather than picking", () => {
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: twoShows }),
    ).toEqual({ outcome: "quarantine", reason: "more-than-one-surviving-id" });
  });

  it("reads only its own kind's results", () => {
    // `find-tvdb-show.json` has one `tv_results` entry and an empty `movie_results`. A
    // film asking the same question finds nothing rather than the show sitting beside it.
    expect(
      reconcileByExternalId("film", GONE, { externalId: TVDB, find: oneShow }),
    ).toEqual({ outcome: "quarantine", reason: "no-surviving-id" });
  });

  it("ignores people, episodes and seasons in the same response", () => {
    // `find-tvdb-show.json` carries a `person_results` entry and a `tv_episode_results`
    // entry, both with ids of their own. Neither is a title, and a decision that counted
    // them would find three survivors where TMDB published one.
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: oneShow }),
    ).toEqual({ outcome: "repoint", toTmdbId: 1396, evidence: TVDB });
  });

  it("quarantines when the only survivor is the id that just 404'd", () => {
    // Built inline rather than captured: TMDB answering 404 for an id and then handing it
    // back from `/find` is an inconsistency, not a documented response. Repointing a
    // title to itself would write a row and stamp `metadata_refreshed_at` for no change,
    // and then 404 again on the next fetch — a quarantine says the true thing instead.
    const itself: TmdbFindPayload = { tv_results: [{ id: GONE }] };
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: itself }),
    ).toEqual({ outcome: "quarantine", reason: "no-surviving-id" });
  });

  it("ignores a result TMDB sent with no id at all", () => {
    // `{}` rather than a result carrying a name: `TmdbFindResultPayload` declares the one
    // field this file reads, so a name is not a thing the type can hold — which is the
    // narrowing `tmdb/mirror.ts` applies to every TMDB payload, for the same reason.
    const idless: TmdbFindPayload = { tv_results: [{}, { id: 1396 }] };
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: idless }),
    ).toEqual({ outcome: "repoint", toTmdbId: 1396, evidence: TVDB });
  });

  it("counts a repeated id once", () => {
    // TMDB is not guaranteed to be free of repeats — `catalogueResults` keys its results
    // for the same reason. Two copies of one id are one survivor, not an ambiguity.
    const repeated: TmdbFindPayload = { tv_results: [{ id: 1396 }, { id: 1396 }] };
    expect(
      reconcileByExternalId("show", GONE, { externalId: TVDB, find: repeated }),
    ).toEqual({ outcome: "repoint", toTmdbId: 1396, evidence: TVDB });
  });

  it("treats a response missing the list entirely as nothing", () => {
    expect(reconcileByExternalId("show", GONE, { externalId: TVDB, find: {} })).toEqual({
      outcome: "quarantine",
      reason: "no-surviving-id",
    });
  });
});

describe("reconcileEpisodes", () => {
  it("keeps the repoint when every watched episode id is in the survivor", () => {
    const survivor = survivorMirror([episodeMirror(62_085), episodeMirror(62_086)]);
    expect(reconcileEpisodes(repointTo1396, survivor, [62_085])).toEqual(repointTo1396);
  });

  it("quarantines when an episode carrying watches is missing from the survivor", () => {
    const survivor = survivorMirror([episodeMirror(62_085)]);
    expect(reconcileEpisodes(repointTo1396, survivor, [62_085, 62_086])).toEqual({
      outcome: "quarantine",
      reason: "watched-episode-missing",
    });
  });

  it("matches by TMDB episode id only — never by season and episode number", () => {
    // The survivor has S1 E1 and S1 E2 exactly as the old entry did, under different TMDB
    // episode ids. That is a different episode row, and the numbers agreeing is not
    // evidence — it is the coincidence that makes an approximate match look correct.
    const survivor = survivorMirror([
      { ...episodeMirror(90_001), seasonNo: 1, episodeNo: 1 },
      { ...episodeMirror(90_002), seasonNo: 1, episodeNo: 2 },
    ]);
    expect(reconcileEpisodes(repointTo1396, survivor, [62_085])).toEqual({
      outcome: "quarantine",
      reason: "watched-episode-missing",
    });
  });

  it("keeps the repoint for a title with no watches on it at all", () => {
    expect(reconcileEpisodes(repointTo1396, survivorMirror([]), [])).toEqual(repointTo1396);
  });

  it("keeps the repoint for a film, which has episodes for nothing to be missing from", () => {
    const film: TitleMirror = { ...survivorMirror([]), kind: "film", tmdbId: 11 };
    const toFilm: Repoint = { outcome: "repoint", toTmdbId: 11, evidence: IMDB };
    expect(reconcileEpisodes(toFilm, film, [])).toEqual(toFilm);
  });

  it("does not mind the survivor gaining episodes, only losing watched ones", () => {
    const survivor = survivorMirror([
      episodeMirror(62_085),
      episodeMirror(62_086),
      episodeMirror(62_087),
    ]);
    expect(reconcileEpisodes(repointTo1396, survivor, [62_085, 62_086])).toEqual(
      repointTo1396,
    );
  });
});
