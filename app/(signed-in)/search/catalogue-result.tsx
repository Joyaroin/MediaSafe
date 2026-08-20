"use client";

import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { Poster } from "@/app/poster";
import { addToLibraryAction, type MarkedResult } from "./actions";

/**
 * One catalogue result, and the one action on it.
 *
 * `docs/design/v1-surfaces.md` §4: *adding is one action from a result, and a result
 * already in your library says so rather than offering to add it twice.* There is no
 * intermediate form, no confirmation and no options — everything the mirror needs is
 * fetched by the action, not asked of the reader.
 *
 * ── The optimistic write, and the toast it raises ────────────────────────────────────
 *
 * This is **the first caller of the write-failure toast**, and it arrives two build steps
 * before the one the toast was built for. `SPEC.md` §11's build order puts the first write
 * at step 4 — the optimistic watch mark — and that was true when the toast was written and
 * is not now: adding a title is a write, it is optimistic, and it can be lost.
 *
 * `SPEC.md` §3.3 is the property: **a lost write is never silent.** Not *always lands*.
 * So:
 *
 *  - the row says *In your library* the moment you press, before the server has answered;
 *  - a failure puts it back, and raises a toast **naming the title**;
 *  - the toast offers *Try again*, and **does not take itself down** when you press it —
 *    whether the retry worked is this component's to know, and it says so by resolving;
 *  - there is no timer anywhere, because a toast that expires makes the lost write silent
 *    again a few seconds after the only person who could act on it looked away.
 *
 * ── Why the handle is a ref ──────────────────────────────────────────────────────────
 *
 * The toast's store is module-level and outlives this component (`errors/write-failure.ts`
 * explains why). That matters here: type another query while an add is in flight and this
 * row unmounts, but the write is still going and the reader must still be told if it was
 * lost. The handle is held in a ref so a retry resolves the toast it raised rather than
 * raising a second one — and `attempt` never reads React state for anything the write
 * depends on, so a closure the store is holding cannot go stale in a way that matters.
 */
export function CatalogueResultRow({
  result,
  aboveFold = false,
}: {
  result: MarkedResult;
  /** This row is the results list's first — `search-surface.tsx`'s to say, since results
   *  render one to a row (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  /**
   * Optimistic. Seeded from the server's answer, set true on press, and set back on
   * failure — the rollback half of `SPEC.md` §3.3.
   */
  const [inLibrary, setInLibrary] = useState(result.inLibrary);
  const raised = useRef<WriteFailureHandle | null>(null);

  /**
   * A function *declaration*, and not a `useCallback`, for one reason: it hands itself to
   * the toast as `retry`, and a `const` cannot be referenced inside its own initialiser.
   * It closes over nothing that changes — `result` is fixed for the life of a row, and
   * both `setInLibrary` and `raised` are stable — so there is nothing a memo would buy and
   * nothing a stale closure could get wrong.
   */
  async function attempt(): Promise<void> {
    setInLibrary(true);

    const outcome = await add(result.kind, result.tmdbId);

    if (outcome.ok) {
      // The write landed — including the retry that landed after a failure, which is the
      // only thing that ever takes this toast down other than the reader.
      raised.current?.resolve();
      raised.current = null;
      return;
    }

    setInLibrary(false);

    // One toast per lost add, not one per attempt. A retry that fails again updates
    // nothing and stacks nothing; the toast is already saying the true thing.
    if (raised.current) return;

    raised.current = writeFailures.raise({
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      title: result.name,
      // No episode: this is a change to the title itself, not to one instalment.
      reference: outcome.reference,
      retry: () => void attempt(),
    });
  }

  return (
    <li className="flex items-center gap-3.5 rounded-2xl bg-raised px-3.5 py-3">
      {/* `52` is what this row now renders at, down from `78` — `Poster`'s contract is
          the real CSS width, and both land in the same `w92` bucket, so the honest number
          costs nothing on the wire. */}
      <Poster
        posterPath={result.posterPath}
        width={52}
        className="w-[52px] shrink-0 [--poster-radius:9px]"
        aboveFold={aboveFold}
      />

      <div className="min-w-0 flex-1">
        <h2 className="text-card font-semibold leading-tight tracking-[-0.012em] text-ink">
          {result.name}
        </h2>
        <p className="mt-1 text-meta leading-[1.3] text-dim" data-numeric>
          {/* The year and the kind, and nothing else. A synopsis here would be both the
              dense row `SPEC.md` §3.4 forbids and a field ADR-0001 forbids storing. */}
          {result.releaseYear === null ? "Year unknown" : result.releaseYear}
          {" · "}
          {result.kind === "film" ? "Film" : "Show"}
        </p>
      </div>

      {inLibrary ? (
        /**
         * It says so, and there is nothing to press. Not a disabled button: a control the
         * reader can reach and cannot use is an invitation withdrawn, and this is a
         * statement of fact about their library.
         */
        <p className="shrink-0 text-meta text-dim">In your library</p>
      ) : (
        /**
         * A vermilion pill — `34px` tall at a `17px` radius, `--accent` filled with an
         * `--accent-ink` label.
         *
         * **This reverses what this file used to say**, which was that the treatment is
         * *not vermilion, because vermilion is reserved for recording a watch and adding
         * a title is not the daily gesture that reservation exists to protect.* The
         * linen redesign restates the reservation rather than dropping it: the accent
         * marks what is live **and the one primary action of a screen**, one per screen
         * and never two (`globals.css` holds the rule in full). Adding is the only
         * action on this screen and the only reason a reader is on it, and on a ground
         * this warm a bordered ghost button beside a filled card no longer reads as a
         * button at all.
         *
         * The `44px` hit target the pill's `34px` does not itself give is `py-1` plus the
         * row's own padding — the tappable area runs the full height of the card.
         */
        <button
          type="button"
          onClick={() => void attempt()}
          /**
           * The visible label is one word because the row it sits in is the context. A
           * screen reader has no row — it has twenty buttons all called *Add* — so the
           * accessible name carries the title the visible label leaves to the layout.
           */
          aria-label={`Add ${result.name} to your library`}
          className="pressable flex h-[34px] shrink-0 items-center rounded-[17px] bg-accent px-4 text-item font-semibold text-accent-ink"
        >
          Add
        </button>
      )}
    </li>
  );
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
