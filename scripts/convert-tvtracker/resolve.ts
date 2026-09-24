import {
  seasonNumbers,
  showMirror,
  type TmdbSeasonPayload,
  type TmdbShowPayload,
} from "@/tmdb/mirror";

import type { EpisodeIndex, IndexedEpisode } from "./map";

/**
 * TMDB episode-id lookups — the IO half of the conversion (issues #61, #68).
 *
 * ── Why this exists at all ────────────────────────────────────────────────────────────
 *
 * `tvtracker`'s `episode_overrides` is keyed `(show_id, season_number, episode_number)`
 * and knows nothing about TMDB's episode ids. MediaSafe's native format is keyed by
 * `tmdb_episode_id`, deliberately: #16 chose it over `(season, episode)` because season and
 * episode numbers are *borrowed* attributes, and a renumber upstream would silently
 * repoint history — whereas an id that no longer resolves fails **here**, at conversion,
 * with a human watching.
 *
 * So this file turns 462 titles into the index `map.ts` takes as an input, and `map.ts`
 * stays pure. Everything that can fail because a network exists lives on this side of that
 * line.
 *
 * ── Deliberately untested, and this paragraph is the decision ─────────────────────────
 *
 * Four tests earn their keep, and #68 put this file outside them
 * in the same terms `tmdb/catalogue.ts` uses: *"TMDB's contract is not ours to assert and a
 * mock of it drifts silently. A resolution failure halts the conversion in front of a
 * human."* What this file does is build URLs, check statuses and hand the bodies to
 * `tmdb/mirror.ts` — which **is** pure and **is** tested. There is no mapping here to drift.
 *
 * ── No cache is committed ─────────────────────────────────────────────────────────────
 *
 * #68 decided that too, and it is the reason #61's *"regenerating produces an identical
 * file"* means **same export and same TMDB state** rather than a weaker guarantee dressed
 * up as a stronger one. A committed cache would let the seed be regenerated against a TMDB
 * that has moved, which hands back exactly the property keying on episode id bought.
 *
 * ── Why it does not import `tmdb/catalogue.ts` ────────────────────────────────────────
 *
 * That file opens with `import "server-only"`, which throws outside a React Server
 * Component — this runs under `tsx` at a terminal. The duplication is four lines of
 * `fetch`, and the half worth sharing is shared: `seasonNumbers` and `showMirror` are
 * imported from `tmdb/mirror.ts`, so the episode ids in the seed are produced by the same
 * tested mapping the app writes its `episode` rows with. **No new mapping.**
 */

const TMDB_API = "https://api.themoviedb.org/3";

/**
 * How many TMDB requests are in flight at once.
 *
 * TMDB permits roughly 40 requests a second and publishes no quota. This is
 * a one-off script run by a person at a terminal, so it is tuned for *finishing* rather
 * than for speed: 8 in flight against ~150ms round trips sits near 50 requests a second at
 * worst, and `withRetry` below absorbs a 429 rather than losing the run.
 */
const CONCURRENCY = 8;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;

function bearerToken(): string {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "TMDB_READ_ACCESS_TOKEN is not set. It is TMDB's API Read Access Token, not the api_key on the same page — see .env.example.",
    );
  }
  return token;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One TMDB GET, retried on the failures that are worth retrying.
 *
 * 429 and 5xx are the network having a moment; 404 is TMDB saying the title is gone, and
 * retrying that just takes longer to reach the same halt. A run that dies three quarters
 * of the way through 462 titles costs the whole resolution, so the retry is here rather
 * than in the caller.
 */
async function get<T>(path: string): Promise<T> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${TMDB_API}${path}`, {
      headers: { Authorization: `Bearer ${bearerToken()}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) return (await response.json()) as T;

    lastStatus = response.status;
    const worthRetrying = response.status === 429 || response.status >= 500;
    if (!worthRetrying || attempt === MAX_ATTEMPTS) break;

    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250);
  }

  // Thrown, never softened into an empty result: `AGENTS.md` — a title resolved to zero
  // episodes would convert to a title with no watches, which is a real state in this file.
  throw new Error(`TMDB answered ${lastStatus} for ${path}`);
}

/** `items` through `run`, at most `size` at a time, preserving order. */
async function inFlight<In, Out>(
  items: readonly In[],
  size: number,
  run: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

/** Every episode TMDB lists for one show, as the mapping wants them. */
async function episodesFor(tmdbId: number): Promise<readonly IndexedEpisode[]> {
  const show = await get<TmdbShowPayload>(`/tv/${tmdbId}`);
  const seasons = await inFlight(seasonNumbers(show), 4, (number) =>
    get<TmdbSeasonPayload>(`/tv/${tmdbId}/season/${number}`),
  );

  // `showMirror` is the app's own tested mapping, including its dedup of an episode TMDB
  // lists under two seasons — so the ids here are the ids import will write.
  return showMirror(show, seasons).episodes.map((episode) => ({
    season: episode.seasonNo,
    episode: episode.episodeNo,
    tmdbEpisodeId: episode.tmdbEpisodeId,
  }));
}

export interface ResolveProgress {
  readonly done: number;
  readonly total: number;
  readonly tmdbId: number;
  readonly episodes: number;
}

/**
 * The episode index for every title the conversion will map.
 *
 * One request per show plus one per season — roughly 2,500 for a 462-title library, which
 * is under two minutes at the concurrency above. A title TMDB no longer answers for stops
 * the run here, which is the point: #61 requires that a numbering mismatch halt rather
 * than repoint history, and a title that has vanished is the loudest version of one.
 */
export async function resolveEpisodeIndex(
  tmdbIds: readonly number[],
  onProgress?: (progress: ResolveProgress) => void,
): Promise<EpisodeIndex> {
  const index = new Map<number, readonly IndexedEpisode[]>();
  let done = 0;

  await inFlight(tmdbIds, CONCURRENCY, async (tmdbId) => {
    const episodes = await episodesFor(tmdbId);
    index.set(tmdbId, episodes);
    done += 1;
    onProgress?.({ done, total: tmdbIds.length, tmdbId, episodes: episodes.length });
  });

  return index;
}
