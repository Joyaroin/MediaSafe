/**
 * What poster a title's own surface should show while it is still reading — issue #303,
 * and `restoration.ts`'s shape applied to a second carried fact.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────
 *
 * Opening a title morphs its poster from wherever it was pressed. The morph's second half
 * — the pending frame that mounts before the title's own read resolves — needs a poster to
 * show, and the one fact it can show is the one the press already had in hand: the library
 * grid cell and the Up next row both know their own `posterPath` before either navigates
 * anywhere. `app/poster-handoff-memory.ts` is where that fact is carried across the route
 * change, in the shape `restoration-memory.ts` already establishes for exactly this
 * reason — one client-scoped variable, threaded through a pure module that holds no state
 * of its own.
 *
 * ── What is remembered, what a surface should show, what an unvisited surface falls
 *    back to ───────────────────────────────────────────────────────────────────────────
 *
 * What is remembered is one title's poster path, carried for exactly one route change.
 * What a surface should show is that path, read by `posterFor` against the title the
 * surface is actually rendering — never assumed, because the carried value can be stale
 * (a browser back button, a bookmark, a second tab all reach `/titles/{id}` without ever
 * running the click that carries a poster). What an unvisited surface falls back to is
 * nothing: `NOTHING_CARRIED`, and a `libraryEntryId` mismatch, both answer `null`, which is
 * exactly the pending frame's own answer today for a cold route render.
 *
 * ── What this is not ──────────────────────────────────────────────────────────────────
 *
 * It holds no state, touches no element, reads no clock and knows nothing about React —
 * `tests/poster-handoff.test.ts` drives it with plain values in `node`. It is never a fact
 * about a library entry: nothing here is read by a data access function, nothing here is
 * written by one, and the one-data-path constraint is untouched by its existence.
 */

/** One title's poster, carried for the length of one navigation into its own page. */
export interface CarriedPoster {
  readonly libraryEntryId: string;
  /** `null` is a title TMDB has no artwork for — a real, present answer, and not the same
   *  fact as nothing having been carried at all (`Carried` below). */
  readonly posterPath: string | null;
}

/** Nothing carried yet this session, or the reader reached this title some way other than
 *  a press that carries one — a back button, a bookmark, a second tab. */
export type Carried = CarriedPoster | null;

/** A session that has just started, or has not opened a title this way yet. */
export const NOTHING_CARRIED: Carried = null;

/** Carry one title's poster, replacing whatever was carried before it. */
export function carry(libraryEntryId: string, posterPath: string | null): Carried {
  return { libraryEntryId, posterPath };
}

/**
 * The poster a title surface should show — the carried path, but only when it was carried
 * for *this* title. A mismatch (or nothing carried at all) answers `null`, the same answer
 * the pending frame has always given a cold render, rather than a different title's
 * artwork shown against the wrong name.
 */
export function posterFor(carried: Carried, libraryEntryId: string): string | null {
  return carried !== null && carried.libraryEntryId === libraryEntryId
    ? carried.posterPath
    : null;
}
