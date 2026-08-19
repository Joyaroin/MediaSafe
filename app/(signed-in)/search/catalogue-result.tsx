"use client";

import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { Plate } from "@/app/plate";
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
export function CatalogueResultRow({ result }: { result: MarkedResult }) {
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
    <li className="flex items-center gap-4 py-4">
      <Plate posterPath={result.posterPath} className="h-[104px] w-[78px] shrink-0" />

      <div className="min-w-0 flex-1">
        <h2 className="bill-title text-bill-md text-text">{result.name}</h2>
        <p className="code-line mt-2 text-dim" data-numeric>
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
        <p className="code-line shrink-0 text-dim">In your library</p>
      ) : (
        /**
         * The chip treatment from `DESIGN.md`, inverted on hover — **not** vermilion.
         * Vermilion is reserved for recording a watch, and adding a title to a library is
         * not the daily gesture that reservation exists to protect.
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
          className="code-line shrink-0 border border-hair px-4 py-2 text-text transition-colors duration-150 hover:bg-text hover:text-ground"
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
