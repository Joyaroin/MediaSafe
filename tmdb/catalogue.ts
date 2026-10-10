import "server-only";

import {
  castFrom,
  crewFrom,
  synopsisFrom,
  watchProvidersFrom,
  type CastMember,
  type CrewMember,
  type TmdbCreditsPayload,
  type TmdbOverviewPayload,
  type TmdbWatchProvidersPayload,
  type WatchProvider,
} from "./live-facts";
import {
  catalogueResults,
  catalogueResultsOfKind,
  filmMirror,
  seasonNumbers,
  SHOW_EXTERNAL_IDS_APPEND,
  showMirror,
  TmdbHttpError,
  type CatalogueResult,
  type ExternalId,
  type TitleKind,
  type TitleMirror,
  type TmdbMoviePayload,
  type TmdbSearchPayload,
  type TmdbSeasonPayload,
  type TmdbShowPayload,
} from "./mirror";
import { findRequestFor, type TmdbFindPayload } from "./reconcile";
import { WATCH_PROVIDER_REGION } from "./region";

/**
 * The calls to TMDB. **Deliberately untested**, and this paragraph is the decision rather
 * than the confession.
 *
 * Four tests earn their keep and everything else "fails
 * loudly and cheaply to an app used daily by its owner". `tmdb/mirror.ts` argues its way
 * out of that — it writes global rows every account reads, so it is tested. This file does
 * not, and the argument is not "it is hard". It is that everything here is a URL, a
 * header, and `fetch`: to test it is to stand up a mock of TMDB and assert that the mock
 * was called, which passes for exactly as long as the mock and TMDB agree and goes green
 * while production goes wrong on the day they stop agreeing. What can drift silently is
 * the *mapping*, which is why the mapping is the half that was pulled out and pinned to
 * captured responses.
 *
 * So the shape of this file is the point: it does no interpreting. It builds a URL, checks
 * the status, parses the body, and hands it to a pure function. A rule for anyone
 * extending it — **if you find yourself writing a branch here, it belongs in `mirror.ts`.**
 *
 * ── `no-store` on every request, still, and now for a sharper reason ────────────────
 *
 * Every request below is `cache: "no-store"`, as it was when a read
 * cache was forbidden outright. Issue #219 reversed that clause and #225 put three of the calls in this
 * file behind an entry — so the line has moved rather than gone, and it is worth saying
 * exactly where it now is: **this file does not cache; `cache/` does.**
 *
 * Next's `fetch` cache is the thing still refused, and refused on the two properties the
 * reversal rests on. It is keyed by URL, so it carries no account and
 * `cache-key-carries-account.mjs` cannot see it; it carries no tag out of the module that
 * owns the vocabulary, so nothing could bust it when the nightly sweep refreshes a title.
 * A cache with neither property is the one shape the reversal explicitly did not buy. The
 * three cached borrowed facts get both, from one file, one layer up.
 *
 * ── The one call that is not cached anywhere, and must not be ────────────────────────
 *
 * `searchCatalogue`. A reader who adds a title and searches for it again must see it as
 * *in your library*, and the screen's own answer to that (`libraryCatalogueKeys`, in
 * `search/actions.ts`) is not the only way a cache could lie here: a stored result set
 * would also hide a title TMDB itself added minutes ago, which is the whole reason
 * somebody searches for something they could not find yesterday. The results are not
 * account-scopeable either — a query string is not a fact about a title or about a reader,
 * so it belongs to neither vocabulary in `cache/`. `tests/cache-tags.test.ts` holds
 * this: the borrowed facts it names are four, and `searchCatalogue` is not one of them.
 *
 * ── The read path never calls this ───────────────────────────────────────────────────
 *
 * The rule: *the read path never calls TMDB for a mirrored field.* Nothing that renders a
 * library, a state, progress or up next may import this module. Three things legitimately
 * do: the search screen, which is by definition asking the catalogue about titles you do
 * not have; the add that follows it; and, since #225, `cache/borrowed-facts.ts`, which
 * wraps the three live-only calls at the foot of this file and no other. None of the three
 * is a mirrored field — that is the whole distinction, and
 * `tmdb/live-facts.ts` owns the side of it these calls are on.
 */

const TMDB_API = "https://api.themoviedb.org/3";

/**
 * TMDB's **API Read Access Token**, sent as a bearer.
 *
 * Not the `api_key` query parameter, which sits on the same TMDB settings page and is the
 * easy one to grab by mistake. Two reasons it is the wrong one: a key in a URL is a key in
 * every access log and every error report that quotes one, and this token is **one
 * credential for both of TMDB's APIs** rather than two.
 *
 * That last part is why the requests below are `/3/` paths carrying a bearer, which looks
 * like a mismatch and is not: the read access token is valid across TMDB's v3 and v4 APIs,
 * so v3's endpoints — which are the ones with `/search/multi` and season details on them —
 * accept it. Do not also wire an `api_key`; there is nothing it would add.
 */
function bearerToken(): string {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    // Loud and early, in the shape `db/driver.ts` uses for `DATABASE_URL`. The
    // alternative is a 401 several frames later wearing a stranger message.
    throw new Error(
      "TMDB_READ_ACCESS_TOKEN is not set. It is TMDB's API Read Access Token, not the api_key on the same page — see .env.example.",
    );
  }
  return token;
}

/**
 * How long any one TMDB request may take before it is a failure.
 *
 * Vercel Hobby allows a function 300 seconds, which is the wrong bound for a person
 * watching a search field. A request that has not answered in eight seconds has failed as
 * far as this screen is concerned, and the screen has a state that says so.
 */
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * How many season requests are in flight at once for one show.
 *
 * TMDB permits roughly 40 requests a second and publishes no quota, and a
 * long-running show is the only place this application ever issues more than a handful of
 * requests at once — *Doctor Who* is forty seasons. Six is well inside the limit and keeps
 * a forty-season add from arriving as one spike that TMDB answers with 429s.
 */
const SEASON_CONCURRENCY = 6;

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${TMDB_API}${path}`);
  for (const [name, value] of Object.entries(params ?? {})) {
    url.searchParams.set(name, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken()}`,
      Accept: "application/json",
    },
    // Never Next's `fetch` cache: it carries no account and no tag. Where a call below is
    // cached it is cached in `cache/`, which carries both. Top of this file.
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    /**
     * Thrown, never softened into an empty result — that is the standing rule and it is the
     * whole reason the search screen can tell *the catalogue has nothing for this* from
     * *MediaSafe could not reach the catalogue*.
     *
     * `TmdbHttpError`, not a plain `Error`, so a caller that genuinely needs the status —
     * the import screen (#73), telling *this id no longer exists on TMDB* apart from
     * *TMDB is unreachable* — can ask for it directly rather than parsing it back out of
     * a message written for Sentry. The message is unchanged either way: nothing puts the
     * status on screen, and the reader gets a plain sentence and, at most, the reference id.
     */
    throw new TmdbHttpError(response.status, `TMDB answered ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}

/**
 * The catalogue, searched by name. Films and shows, in TMDB's relevance order.
 *
 * *Search*, not *filter* — the first word is reserved for the catalogue and the
 * second for your own library, and the two are not interchangeable in a function name any
 * more than they are in a label.
 */
export async function searchCatalogue(query: string): Promise<CatalogueResult[]> {
  const payload = await get<TmdbSearchPayload>("/search/multi", {
    query,
    include_adult: "false",
    page: "1",
  });

  return catalogueResults(payload);
}

/**
 * The facts a catalogue title's *detail* screen needs, for a title this database has never
 * mirrored — one request, and no write.
 *
 * ── Why this exists beside `titleMirror` ────────────────────────────────────────────
 *
 * `titleMirror` is the **add** path: it fetches a show's every season so the episode names
 * the schema stores are there to store, at a cost of one request per season. That is the
 * right price for taking a title into your library and the wrong one for glancing at it,
 * which is what catalogue detail now is — a card in a recommendation rail is pressed to
 * find out what something *is*, most often to then not add it.
 *
 * ── And why it exists beside `getUnownedTitleDetail` ────────────────────────────────
 *
 * That read answers from the `title` table and throws when the row is not there, which is
 * correct for where it came from: issue #148 built it for a title sitting in one of your
 * lists, and a list membership guarantees the mirror row exists. Catalogue detail reached
 * from search or a rail has no such guarantee — the title is one TMDB knows about and this
 * database has never heard of — so a read that requires a mirror row cannot serve it.
 *
 * No episodes come back, and that is deliberate rather than a gap: episodes cost a request
 * per season, and `UnownedEpisodes` (issue #148) is inert anyway. What the screen loses by
 * not listing them is a list you cannot press; what it would cost to have them is a
 * fan-out of requests on a glance.
 */
export interface CatalogueSummary {
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  readonly runtimeMins: number | null;
}

export async function catalogueSummary(
  kind: TitleKind,
  tmdbId: number,
): Promise<CatalogueSummary> {
  if (kind === "film") {
    const movie = await get<TmdbMoviePayload>(`/movie/${tmdbId}`);
    const mirror = filmMirror(movie);

    return {
      kind,
      tmdbId,
      name: mirror.name,
      releaseYear: mirror.releaseYear,
      posterPath: mirror.posterPath,
      runtimeMins: mirror.runtimeMins,
    };
  }

  // `/tv/{id}` alone — no `append_to_response` and no seasons. The external ids the add
  // path appends are a fact about a row being written; nothing is being written here.
  const show = await get<TmdbShowPayload>(`/tv/${tmdbId}`);
  const mirror = showMirror(show, []);

  return {
    kind,
    tmdbId,
    name: mirror.name,
    releaseYear: mirror.releaseYear,
    posterPath: mirror.posterPath,
    runtimeMins: mirror.runtimeMins,
  };
}

/**
 * The catalogue, searched by name, within **one kind** — `/search/tv` or `/search/movie`.
 *
 * The Films/Shows mode on the search screen chooses which. Two endpoints rather than a
 * filter over `/search/multi`: a mode that returns three results because seventeen were
 * the other kind reads as broken search, and a film ranked twenty-first in a multi-search
 * would never appear even when it is the best film for the query.
 *
 * `searchCatalogue` below is kept and still serves nothing filtering by kind. The two are
 * one mapping under the hood (`catalogueResultsOfKind` and `catalogueResults` share
 * `collectResults`), so they cannot drift on de-duplication or ordering.
 */
export async function searchCatalogueOfKind(
  kind: TitleKind,
  query: string,
): Promise<CatalogueResult[]> {
  const payload = await get<TmdbSearchPayload>(
    kind === "film" ? "/search/movie" : "/search/tv",
    { query, include_adult: "false", page: "1" },
  );

  return catalogueResultsOfKind(kind, payload);
}

/**
 * What TMDB recommends off one title you have watched — the *Because you watched* rail.
 *
 * Same kind as the seed, because that is what the endpoints give: `/tv/{id}/recommendations`
 * returns shows and `/movie/{id}/recommendations` returns films. The rail follows the
 * search screen's mode, which is what makes that a feature rather than a limitation — the
 * rail and the field below it are about the same kind of thing.
 *
 * Malformed rows are dropped rather than thrown, following `catalogueResults`' reasoning:
 * one missing card in a rail is not a rail that failed, and a failed rail has its own
 * treatment on that screen.
 */
export async function recommendationsFor(
  kind: TitleKind,
  tmdbId: number,
): Promise<CatalogueResult[]> {
  const payload = await get<TmdbSearchPayload>(
    `/${kind === "film" ? "movie" : "tv"}/${tmdbId}/recommendations`,
    { page: "1" },
  );

  return catalogueResultsOfKind(kind, payload);
}

/**
 * What TMDB says is trending this week, films and shows together — issue #365's fallback
 * for Up next's empty state, when the reader has watched nothing to seed recommendations
 * from. `/trending/all/week` is a multi-kind list, so it goes through `catalogueResults`,
 * which drops people and keeps TMDB's order.
 */
export async function trendingTitles(): Promise<CatalogueResult[]> {
  const payload = await get<TmdbSearchPayload>("/trending/all/week", { page: "1" });

  return catalogueResults(payload);
}

/**
 * Everything one add writes: the `title` row, and for a show every `episode` row under it.
 *
 * A show costs one request for the series and one per season. That is the price of episode
 * **names**, which the mirror stores and the domain language makes load-bearing — TMDB's series
 * endpoint lists seasons but not the episodes inside them.
 */
export async function titleMirror(
  kind: TitleKind,
  tmdbId: number,
): Promise<TitleMirror> {
  if (kind === "film") {
    return filmMirror(await get<TmdbMoviePayload>(`/movie/${tmdbId}`));
  }

  // `append_to_response`, so the external id arrives in the request the show already
  // costs. See `SHOW_EXTERNAL_IDS_APPEND` for why this is not the trade the three live
  // calls below refuse.
  const show = await get<TmdbShowPayload>(`/tv/${tmdbId}`, {
    append_to_response: SHOW_EXTERNAL_IDS_APPEND,
  });
  const seasons = await inBatches(seasonNumbers(show), SEASON_CONCURRENCY, (number) =>
    get<TmdbSeasonPayload>(`/tv/${tmdbId}/season/${number}`),
  );

  return showMirror(show, seasons);
}

/**
 * The `title` row and nothing under it — one request, whatever the kind (issue #271).
 *
 * This is `titleMirror` above without the per-season fetches, and it exists because those
 * are what made adding a show slow: the series costs one request and the seasons cost one
 * apiece, in front of a reader waiting for the press to come back. The add writes the row
 * this returns, answers, and lets `titleMirror` run behind the response.
 *
 * A **film** is the same call as `titleMirror` makes, because a film has no seasons to
 * skip — it delegates rather than restating `/movie/{id}`, so there is one place a film's
 * mirror is fetched from.
 *
 * `episodes` comes back empty for a show, and the caller must not read that as *this show
 * has no episodes*: `db/access.ts` writes the row as pending, which is the distinction
 * amendment 11 exists to keep.
 */
export async function titleRowMirror(
  kind: TitleKind,
  tmdbId: number,
): Promise<TitleMirror> {
  if (kind === "film") return titleMirror(kind, tmdbId);

  const show = await get<TmdbShowPayload>(`/tv/${tmdbId}`, {
    append_to_response: SHOW_EXTERNAL_IDS_APPEND,
  });
  return showMirror(show, []);
}

/**
 * `items` through `run`, at most `size` at a time.
 *
 * `Promise.all` over the batch, so one failed season fails the whole add — which is the
 * behaviour worth having: a show mirrored with a season missing is a show whose *finished*
 * and *caught up* states are wrong for everybody, and it would look exactly like a show
 * that really has those episodes missing.
 */
async function inBatches<In, Out>(
  items: readonly In[],
  size: number,
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

/**
 * What a stored external id still resolves to on TMDB — the one lookup the nightly
 * sweep's 404 path makes (issue #116).
 *
 * `/find/{external_id}?external_source=…` is the only endpoint TMDB has that answers *what
 * is this title now*, because it publishes no successor id: a deleted or merged id returns
 * 404, error code 6, and nothing else. Both halves of the request come out of the one
 * stored column, through `findRequestFor`, so there is no call site that can pair an IMDb
 * id with `tvdb_id`.
 *
 * **No `language` and no `page`.** Neither would change which ids come back, and the ids
 * are the entire content of this response as far as MediaSafe is concerned —
 * `tmdb/reconcile.ts` declines to even declare the names and dates TMDB sends alongside
 * them.
 *
 * A 404 here is not special-cased, unlike the one on the title itself: `/find` answers 200
 * with five empty lists for an external id it does not know, and that is the *nothing
 * survives* case, which `reconcileByExternalId` reads off the body. A non-2xx from this
 * endpoint is TMDB being unreachable, so it throws like every other call in this file and
 * the title is retried on the next run.
 */
export async function findByExternalId(externalId: ExternalId): Promise<TmdbFindPayload> {
  const { externalSource, id } = findRequestFor(externalId);
  return get<TmdbFindPayload>(`/find/${id}`, { external_source: externalSource });
}

/** `/movie/{id}` or `/tv/{id}` — the one fork every endpoint below shares. */
function titlePath(kind: TitleKind, tmdbId: number): string {
  return kind === "film" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
}

/**
 * The three live-only calls title detail makes — `tmdb/live-facts.ts`'s half of
 * the metadata caching policy, fetched fresh on every visit and never mirrored.
 *
 * Three separate requests, deliberately, rather than one call with TMDB's
 * `append_to_response`: a live-only field fails inline
 * **within its own section**, and that is only genuinely true if a synopsis TMDB answered
 * can render while the credits request TMDB is 500ing on the same title cannot — which a
 * combined call could not do, because one response either has everything or is one
 * failure covering all three.
 */

/** `null` when TMDB has not written a synopsis, or has written the empty string. */
export async function titleSynopsis(
  kind: TitleKind,
  tmdbId: number,
): Promise<string | null> {
  return synopsisFrom(await get<TmdbOverviewPayload>(titlePath(kind, tmdbId)));
}

/**
 * One **episode's** own synopsis — the fourth live-only call, and the only one of the
 * four that is about an instalment rather than a title (issue #253).
 *
 * ── Why this is a live read and not a fifth mirrored column ─────────────────────────
 *
 * Synopsis and overview are on the borrowed side and issue #245 says in as many
 * words that nothing in that batch moves them. The test applied is *what a
 * 472-row library render needs* — issue #246 moved stills and release dates across
 * because a rail of cards would otherwise cost one catalogue call each. An episode's
 * synopsis fails that test in the other direction: it is read on a surface a reader
 * reaches one episode at a time, so it costs one call when one episode is opened, and a
 * column for it would be one row of prose per episode across every show in the mirror to
 * save a request nothing makes in bulk.
 *
 * ── Shows only, and the type is what says so ────────────────────────────────────────
 *
 * No `kind` parameter, unlike the three above. A film has no episodes, and this endpoint
 * has no film counterpart to fork to — `titlePath`'s `film`/`show` branch has nothing to
 * answer here. So the signature takes a show's `tmdbId` and the two numbers, and a caller
 * holding a film cannot reach this by passing the wrong literal.
 *
 * ── The numbers, and not the episode's own TMDB id ──────────────────────────────────
 *
 * TMDB addresses an episode by `(series, season number, episode number)` and publishes no
 * endpoint keyed on the episode id it hands back in a season payload. `episode.tmdb_episode_id`
 * is the mirror's identity for exactly the reason `db/tables.ts` gives — numbers get
 * renumbered — and this is the one place that identity cannot be used, because TMDB's own
 * API does not accept it. The caller reads the numbers off the mirrored row it is already
 * rendering, so a renumbering upstream is reflected in the request as soon as the sweep
 * has rewritten the row.
 *
 * Untested here, like every other call in this file: the request is the untestable half
 * and `synopsisFrom` — the same mapping `titleSynopsis` uses, over the same `overview`
 * field — is the half `tests/tmdb-live-facts.test.ts` covers.
 */
export async function episodeSynopsis(
  tmdbId: number,
  seasonNo: number,
  episodeNo: number,
): Promise<string | null> {
  return synopsisFrom(
    await get<TmdbOverviewPayload>(`/tv/${tmdbId}/season/${seasonNo}/episode/${episodeNo}`),
  );
}

export interface CastAndCrew {
  readonly cast: readonly CastMember[];
  readonly crew: readonly CrewMember[];
}

export async function titleCastAndCrew(
  kind: TitleKind,
  tmdbId: number,
): Promise<CastAndCrew> {
  const payload = await get<TmdbCreditsPayload>(`${titlePath(kind, tmdbId)}/credits`);
  return { cast: castFrom(payload), crew: crewFrom(payload) };
}

/**
 * The region providers are read for — `tmdb/region.ts`, which is where it moved when the
 * screen started printing it. That file has the reasoning; this import is what keeps one
 * copy of the value.
 */


export async function titleWatchProviders(
  kind: TitleKind,
  tmdbId: number,
): Promise<readonly WatchProvider[]> {
  const payload = await get<TmdbWatchProvidersPayload>(
    `${titlePath(kind, tmdbId)}/watch/providers`,
  );
  return watchProvidersFrom(payload, WATCH_PROVIDER_REGION);
}
