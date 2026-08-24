import "server-only";

import {
  cachedEpisodeSynopsis,
  cachedTitleCastAndCrew,
  cachedTitleSynopsis,
  cachedTitleWatchProviders,
} from "@/cache/borrowed-facts";
import type { UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The live-only reads of title detail — synopsis, cast and crew, watch providers, and
 * since issue #253 one episode's own synopsis beside them, which is the one read here
 * that no title-level surface makes; `readEpisodeSynopsis`'s own docblock is why it is a
 * fourth function rather than a fourth field of `LiveFacts`. Everything below about the
 * cache, the `catch` and the account is common to all four.
 *
 * The original three are issue #218. They used to fire from the browser after
 * `LiveTitleFacts` mounted, one
 * `useEffect` per section, each its own client round trip to a Server Action. That made the
 * page paint and then make three trips to TMDB. This module is what runs instead: the same
 * three reads, concurrently, on the server, before there is a page to send.
 *
 * ── One `Outcome` per field, not one for all three ────────────────────────────────────
 *
 * `title-detail-actions.ts`'s own docblock explains why the reads have always been three
 * calls rather than one: *a combined call either has everything or is one failure covering
 * all three*, and this ticket's own acceptance criteria repeat it — one failed fetch must
 * never take the other two. `readLiveFacts` below is one function, but it still produces
 * three independent outcomes, `Promise.all`-ed rather than merged, so a `titleWatchProviders`
 * rejection cannot touch the `titleSynopsis` result sitting beside it.
 *
 * ── Since issue #225 the three go through the cache, and the `catch` stays out here ──
 *
 * `cache/borrowed-facts.ts` is what actually calls TMDB now, behind an entry with a tag
 * and a six-hour window. Which side of the cache the `try` below sits on is the whole of what
 * this ticket had to get right: **outside**. `unstable_cache` stores a resolved value and
 * nothing else, so a TMDB outage leaves no entry, the section renders its own inline
 * recovery with a reference id, and the reader's *Try again* is a real retry. An
 * `Outcome` computed inside the cache would have pinned *this region failed* for six
 * hours — a cache miss rendered as an empty region, which is the one thing the acceptance
 * criteria name twice.
 *
 * ── The account is an argument, resolved once by the caller ──────────────────────────
 *
 * Every cache key in this application carries one (`cache/`, and the lint rule that
 * enforces it), so these three need one to pass down. It arrives as a parameter rather
 * than being resolved here: `requireUserId` is a session lookup, the three reads run
 * concurrently, and doing it inside each would make one page render resolve the same
 * session three times. Both callers — the streamed Server Component and the Server
 * Actions in `title-detail-actions.ts` — already hold a `UserId` before they get here.
 */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reference: string | null };

export interface LiveFacts {
  readonly synopsis: Outcome<string | null>;
  readonly watchProviders: Outcome<readonly WatchProvider[]>;
  readonly castAndCrew: Outcome<CastAndCrew>;
}

async function outcomeOf<T>(read: () => Promise<T>, surface: string): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface }) };
  }
}

export function readSynopsis(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  return outcomeOf(() => cachedTitleSynopsis(userId, kind, tmdbId), "title-synopsis");
}

/**
 * One episode's own synopsis — issue #253, and the fourth read this module wraps.
 *
 * ── It is a fourth read, not a fourth field of `LiveFacts` ──────────────────────────
 *
 * `readLiveFacts` below runs three concurrently because one surface shows all three at
 * once. No surface shows this one beside them: an episode page carries a synopsis and
 * deliberately carries neither watch providers nor cast, because both are title-level
 * facts already on the title page and each would be another live read on a surface
 * reached by tapping a card (issue #253, and #245's own wording). So this joins the file
 * rather than the tuple, taking the same `Outcome` treatment for the same reason — a
 * failed synopsis is data the section renders, not a throw that takes the page.
 *
 * ── Its own `surface`, so a failure says which read it was ──────────────────────────
 *
 * `title-synopsis` and `episode-synopsis` are two different requests to two different
 * TMDB endpoints, and the reference id a reader is shown is the Sentry event id
 * (`errors/reference.ts`). Reusing the title's tag would make the two indistinguishable
 * in the one place the distinction is worth having — the report you open when a reader
 * quotes the id.
 */
export function readEpisodeSynopsis(
  userId: UserId,
  tmdbId: number,
  seasonNo: number,
  episodeNo: number,
): Promise<Outcome<string | null>> {
  return outcomeOf(
    () => cachedEpisodeSynopsis(userId, tmdbId, seasonNo, episodeNo),
    "episode-synopsis",
  );
}

export function readCastAndCrew(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<CastAndCrew>> {
  return outcomeOf(() => cachedTitleCastAndCrew(userId, kind, tmdbId), "title-cast-crew");
}

export function readWatchProviders(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  return outcomeOf(
    () => cachedTitleWatchProviders(userId, kind, tmdbId),
    "title-watch-providers",
  );
}

/** The three reads above, run concurrently. Never rejects — a failed field is data, not a throw. */
export async function readLiveFacts(
  userId: UserId,
  kind: TitleKind,
  tmdbId: number,
): Promise<LiveFacts> {
  const [synopsis, watchProviders, castAndCrew] = await Promise.all([
    readSynopsis(userId, kind, tmdbId),
    readWatchProviders(userId, kind, tmdbId),
    readCastAndCrew(userId, kind, tmdbId),
  ]);
  return { synopsis, watchProviders, castAndCrew };
}
