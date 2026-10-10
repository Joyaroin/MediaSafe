"use client";

import { useRef, useState } from "react";

import { raiseLostAdd, type StandingAdd } from "@/app/(signed-in)/catalogue/lost-add";
import { referenceFor } from "@/errors/reference";
import {
  addToLibraryAction,
  addWatchedToLibraryAction,
  type MarkedResult,
} from "./actions";

/**
 * The one-tap add from a catalogue result, and its write-failure toast — lifted out of
 * `catalogue-result.tsx` so Up next's empty-state suggestions (issue #365) press the same
 * add rather than a second one. Everything below is that row's, unchanged.
 */
export function useCatalogueAdd(result: MarkedResult): {
  readonly inLibrary: boolean;
  attempt(watched: boolean): Promise<void>;
} {
  /**
   * Optimistic. Seeded from the server's answer, set true on press, and set back on
   * failure — the rollback half of that property.
   */
  const [inLibrary, setInLibrary] = useState(result.inLibrary);
  const raised = useRef<StandingAdd | null>(null);
  /**
   * The watched add's idempotency key — issue #222. Minted on the first press and kept,
   * so a retry after a lost write is **the same write** rather than a second one: the
   * key is what `UNIQUE (user_id, source, source_key)` matches on, and a fresh one per
   * attempt would let a retry that raced a write which actually landed record a whole
   * show twice. `watch-marks.ts` mints one per episode for exactly this reason.
   *
   * A ref and not state, because nothing renders differently for it, and because it must
   * survive into the toast's `retry` closure unchanged.
   */
  const watchedKey = useRef<string | null>(null);

  /**
   * A function *declaration*, and not a `useCallback`, for one reason: it hands itself to
   * the toast as `retry`, and a `const` cannot be referenced inside its own initialiser.
   * It closes over nothing that changes — `result` is fixed for the life of a row, and
   * `setInLibrary`, `raised` and `watchedKey` are all stable — so there is nothing a memo
   * would buy and nothing a stale closure could get wrong.
   *
   * ── One function for both controls, and one toast between them ──────────────────────
   *
   * `watched` picks the write, and everything either side of it is identical because the
   * two presses land the reader in the same place — *this title is now in your library*.
   *
   * **They are still two writes, and this used to say they were one event.** That claim
   * is what the two-axis review of #222 took apart: a lost *Add — watched* answered by a
   * standing *Add* toast is a backfill that vanishes and reports success. So `watched`
   * travels into `raiseLostAdd` as well as into the retry closure, and `lost-add.ts`
   * decides what a second lost add does to the first one's toast. What is shared is the
   * ref, not the assumption.
   *
   * A retry always retries **the press that failed**, because `watched` travels into the
   * closure the toast holds. The alternative — a retry that re-read which control was
   * pressed last — would quietly turn a retried film add into a watch.
   */
  async function attempt(watched: boolean): Promise<void> {
    setInLibrary(true);

    const outcome = watched
      ? await addWatched(result.kind, result.tmdbId, (watchedKey.current ??= mintKey()))
      : await add(result.kind, result.tmdbId);

    if (outcome.ok) {
      // The write landed — including the retry that landed after a failure, which is the
      // only thing that ever takes this toast down other than the reader.
      raised.current?.handle.resolve();
      raised.current = null;
      return;
    }

    setInLibrary(false);

    /**
     * One toast per title, about the press the reader made last — `lost-add.ts` holds the
     * rule and the whole argument for it, including the failure the two-axis review of
     * #222 found in the bare `if (raised.current?.standing()) return` this line replaced.
     * The short version: with two controls on one row, that guard let a lost *watched*
     * add be answered by a *plain* add's *Try again*, which then resolved as a success.
     */
    raised.current = raiseLostAdd(raised.current, {
      watched,
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      title: result.name,
      reference: outcome.reference,
      retry: () => void attempt(watched),
    });
  }

  return { inLibrary, attempt };
}

/**
 * The action, with the one failure it cannot report itself turned into the same shape —
 * the request never reaching the server. See `search-surface.tsx`'s `search()`.
 */
async function add(kind: MarkedResult["kind"], tmdbId: number) {
  try {
    return await addToLibraryAction(kind, tmdbId);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "search-add" }),
    };
  }
}

/** The same, for the watched add — issue #222. */
async function addWatched(
  kind: MarkedResult["kind"],
  tmdbId: number,
  sourceKey: string,
) {
  try {
    return await addWatchedToLibraryAction(kind, tmdbId, sourceKey);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "search-add-watched" }),
    };
  }
}

/**
 * One press, one idempotency key — the same `crypto.randomUUID()` `watch-marks.ts` mints
 * per episode, and the same reasoning: the key names **the write**, not the attempt, so
 * every route back to it — the control and the toast's *Try again* — reuses it and a
 * retry is a no-op rather than a second recording.
 */
const mintKey = () => crypto.randomUUID();
