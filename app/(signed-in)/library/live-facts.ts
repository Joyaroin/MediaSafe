import "server-only";

import { referenceFor } from "@/errors/reference";
import { titleCastAndCrew, titleSynopsis, titleWatchProviders, type CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";

/**
 * The three live-only reads of title detail — synopsis, cast and crew, watch providers —
 * issue #218. They used to fire from the browser after `LiveTitleFacts` mounted, one
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

export function readSynopsis(kind: TitleKind, tmdbId: number): Promise<Outcome<string | null>> {
  return outcomeOf(() => titleSynopsis(kind, tmdbId), "title-synopsis");
}

export function readCastAndCrew(kind: TitleKind, tmdbId: number): Promise<Outcome<CastAndCrew>> {
  return outcomeOf(() => titleCastAndCrew(kind, tmdbId), "title-cast-crew");
}

export function readWatchProviders(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  return outcomeOf(() => titleWatchProviders(kind, tmdbId), "title-watch-providers");
}

/** The three reads above, run concurrently. Never rejects — a failed field is data, not a throw. */
export async function readLiveFacts(kind: TitleKind, tmdbId: number): Promise<LiveFacts> {
  const [synopsis, watchProviders, castAndCrew] = await Promise.all([
    readSynopsis(kind, tmdbId),
    readWatchProviders(kind, tmdbId),
    readCastAndCrew(kind, tmdbId),
  ]);
  return { synopsis, watchProviders, castAndCrew };
}
