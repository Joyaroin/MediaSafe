import "server-only";

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
 * TMDB's v4 read access token, sent as a bearer. Not the v3 `api_key` query parameter:
 * a key in a URL is a key in every access log and every error report that quotes one.
 */
function bearerToken(): string {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    // Loud and early, in the shape `db/driver.ts` uses for `DATABASE_URL`. The
    // alternative is a 401 several frames later wearing a stranger message.
    throw new Error(
      "TMDB_READ_ACCESS_TOKEN is not set. It is TMDB's v4 API Read Access Token — see .env.example.",
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
