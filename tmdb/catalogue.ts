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
  filmMirror,
  seasonNumbers,
  showMirror,
  type CatalogueResult,
  type TitleKind,
  type TitleMirror,
  type TmdbMoviePayload,
  type TmdbSearchPayload,
  type TmdbSeasonPayload,
  type TmdbShowPayload,
} from "./mirror";

/**
 * The calls to TMDB. **Deliberately untested**, and this paragraph is the decision rather
 * than the confession.
 *
 * `SPEC.md` §6 names four tests that earn their keep and says everything else "fails
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
 * ── No cache, and that is `SPEC.md` §3.1 ─────────────────────────────────────────────
 *
 * Every request below is `cache: "no-store"`. Constraint 1 forbids a read cache, and
 * Next's `fetch` cache is one — it would also mean a title added minutes ago being missing
 * from a result set that was rendered from a stored response. The mirror is the cache this
 * product has, it lives in Postgres, and ADR-0001 gives it a nightly refresh and a
 * six-month ceiling.
 *
 * ── The read path never calls this ───────────────────────────────────────────────────
 *
 * ADR-0001: *the read path never calls TMDB for a mirrored field.* Nothing that renders a
 * library, a state, progress or up next may import this module. Two things legitimately
 * do: the search screen, which is by definition asking the catalogue about titles you do
 * not have, and the add that follows it.
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
 * TMDB permits roughly 40 requests a second and publishes no quota (`SPEC.md` §6), and a
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
    // SPEC.md §3.1 — no read cache. See the note at the top of this file.
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    /**
     * Thrown, never softened into an empty result — that is `SPEC.md` §3.2 and it is the
     * whole reason the search screen can tell *the catalogue has nothing for this* from
     * *MediaSafe could not reach the catalogue*.
     *
     * The status is in the message because this message is for Sentry. Nothing puts it on
     * screen: the reader gets a plain sentence and, at most, the reference id.
     */
    throw new Error(`TMDB answered ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}

/**
 * The catalogue, searched by name. Films and shows, in TMDB's relevance order.
 *
 * *Search*, not *filter* — CONTEXT.md reserves the first word for the catalogue and the
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
 * Everything one add writes: the `title` row, and for a show every `episode` row under it.
 *
 * A show costs one request for the series and one per season. That is the price of episode
 * **names**, which ADR-0001 mirrors and CONTEXT.md makes load-bearing — TMDB's series
 * endpoint lists seasons but not the episodes inside them.
 */
export async function titleMirror(
  kind: TitleKind,
  tmdbId: number,
): Promise<TitleMirror> {
  if (kind === "film") {
    return filmMirror(await get<TmdbMoviePayload>(`/movie/${tmdbId}`));
  }

  const show = await get<TmdbShowPayload>(`/tv/${tmdbId}`);
  const seasons = await inBatches(seasonNumbers(show), SEASON_CONCURRENCY, (number) =>
    get<TmdbSeasonPayload>(`/tv/${tmdbId}/season/${number}`),
  );

  return showMirror(show, seasons);
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

/** `/movie/{id}` or `/tv/{id}` — the one fork every endpoint below shares. */
function titlePath(kind: TitleKind, tmdbId: number): string {
  return kind === "film" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
}

/**
 * The three live-only calls title detail makes — `tmdb/live-facts.ts`'s half of
 * ADR-0001's metadata caching policy, fetched fresh on every visit and never mirrored.
 *
 * Three separate requests, deliberately, rather than one call with TMDB's
 * `append_to_response`: `docs/design/v1-surfaces.md` says a live-only field fails inline
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
 * MediaSafe is single-account and has no `user`-level region today, so this is a fixed
 * default rather than a preference read from anywhere. `tmdb/live-facts.ts`'s
 * `watchProvidersFrom` takes the region as a parameter for exactly this reason — the day
 * a region setting exists, this is the one line that changes.
 */
const WATCH_PROVIDER_REGION = "CA";

export async function titleWatchProviders(
  kind: TitleKind,
  tmdbId: number,
): Promise<readonly WatchProvider[]> {
  const payload = await get<TmdbWatchProvidersPayload>(
    `${titlePath(kind, tmdbId)}/watch/providers`,
  );
  return watchProvidersFrom(payload, WATCH_PROVIDER_REGION);
}
