"use client";

import { useSyncExternalStore } from "react";

import { GHOST_RECOVERY, SOLID_RECOVERY } from "./recovery-buttons";
import { ReferenceLine } from "./reference-line";
import { type RaisedWriteFailure, writeFailures } from "./write-failure";

/**
 * DESIGN.md, States: *a persistent toast on solid `ink` inside a `2px` `signal` border —
 * `420px` bottom-right on desktop, full-bleed above the tab bar on phone. Heading at
 * `text-bill-sm` in `signal`, the affected title and episode named in full, a solid *Try
 * again*, a ghost *Dismiss*, and a copyable reference id. It does not auto-dismiss.*
 *
 * **Its first caller is the add on the search screen** —
 * `app/(signed-in)/search/catalogue-result.tsx`, issue #55 — and that it was built before
 * the caller existed is the point. This file used to name step 4's optimistic watch mark
 * as the first place in the product where a write can be lost. It is not: adding a title
 * is a write too, and it is optimistic for the same reason.
 *
 * The API is `errors/write-failure.ts`:
 *
 * ```ts
 * const raised = writeFailures.raise({
 *   title: "Severance",
 *   episode: "Season 2, Episode 4 — Woe's Hollow",
 *   reference: referenceFor(error),
 *   retry: () => void markWatched(episodeId),
 * });
 *
 * // When the write eventually lands, the caller takes its own toast down.
 * raised.resolve();
 * ```
 *
 * Note what the call cannot pass: a message. The toast writes its own sentences from the
 * title and the episode, so there is no route by which an exception's text reaches the
 * screen — DESIGN.md allows exactly one technical string anywhere, and it is the
 * reference id.
 */
export function WriteFailureToasts() {
  const failures = useSyncExternalStore(
    writeFailures.subscribe,
    writeFailures.get,
    writeFailures.get,
  );

  if (failures.length === 0) return null;

  return (
    <div
      // `pointer-events-none` on the region, restored on each toast: the container spans a
      // corner of the viewport even when it holds one short toast, and it must not swallow
      // clicks on whatever is underneath it.
      //
      // `bottom-[49px]` lifts this above the tab bar — `tab-bar.tsx`'s
      // `TAB_BAR_HEIGHT_PX`, kept in step by hand because a Tailwind utility class and an
      // exported number cannot share one literal. Issue #102 built the bar this was
      // written to wait for; this is that lift.
      className="pointer-events-none fixed inset-x-0 bottom-[49px] z-40 flex flex-col gap-px lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[420px]"
    >
      {failures.map((failure) => (
        <WriteFailureToast key={failure.id} failure={failure} />
      ))}
    </div>
  );
}

function WriteFailureToast({ failure }: { failure: RaisedWriteFailure }) {
  return (
    <div
      // Assertive, unlike the offline banner: this is the result of something the reader
      // just did, and it says that the thing did not happen.
      role="alert"
      className="pointer-events-auto border-2 border-signal bg-ink p-4"
    >
      <h2 className="bill-title text-bill-sm text-signal">That did not save</h2>

      {/* Named in full, both of them, and set as their own block rather than folded into
          the sentence. CONTEXT.md gives episodes real names — "Season 2, Episode 4 —
          Woe's Hollow" — and a sentence with one of those inside it collides with its own
          punctuation and stops being readable at exactly the moment it matters. */}
      <p className="mt-3 text-item text-stock">{failure.title}</p>
      {failure.episode ? (
        <p className="text-item text-stock-dim">{failure.episode}</p>
      ) : null}

      <p className="mt-3 text-note leading-relaxed text-stock">
        Your change did not reach MediaSafe. Nothing else was affected.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Retrying does not take the toast down — whether the retry succeeded is the
            caller's to know, and it says so by resolving. */}
        {failure.retry ? (
          <button type="button" onClick={failure.retry} className={SOLID_RECOVERY}>
            Try again
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => writeFailures.dismiss(failure.id)}
          className={GHOST_RECOVERY}
        >
          Dismiss
        </button>
      </div>

      {failure.reference === null ? null : (
        <div className="mt-3">
          <ReferenceLine reference={failure.reference} />
        </div>
      )}
    </div>
  );
}
