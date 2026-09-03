"use client";

import { carry, NOTHING_CARRIED, posterFor, type Carried } from "@/app/poster-handoff";

/**
 * The one variable `app/poster-handoff.ts` is threaded through — issue #303, in the shape
 * `app/restoration-memory.ts` already establishes and for the same reason: a module
 * variable in the client bundle is emptied by exactly the event that should empty it. A
 * reload evaluates this file again and the reader who lands on a title cold gets `null`
 * back from `carriedPosterFor`, the same answer the pending frame has always given a route
 * it was not handed anything for.
 *
 * `"use client"` is load-bearing for `restoration-memory.ts`'s own reason: a module-level
 * variable evaluated on the server is one variable for every reader the process is
 * serving, and this one holds a poster path. The directive keeps this file in the client
 * bundle, so `app/poster-handoff.ts` above it stays pure and directive-free and can be
 * driven directly in `node` (`tests/poster-handoff.test.ts`).
 *
 * Read on demand, not subscribed to: nothing re-renders when this changes. It is written
 * once, at the moment a press carries a poster into a navigation, and read once, as the
 * destination's pending frame mounts.
 */
let carried: Carried = NOTHING_CARRIED;

/** Carry one title's poster into the navigation that is about to happen. */
export function carryPoster(libraryEntryId: string, posterPath: string | null): void {
  carried = carry(libraryEntryId, posterPath);
}

/** The poster carried for this title, or `null` if nothing was carried for it. */
export function carriedPosterFor(libraryEntryId: string): string | null {
  return posterFor(carried, libraryEntryId);
}
