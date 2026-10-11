"use client";

import { useState, useSyncExternalStore } from "react";

import { GHOST_RECOVERY, SOLID_RECOVERY } from "./recovery-buttons";
import { ReferenceLine } from "./reference-line";
import { type RaisedWriteFailure, writeFailures } from "./write-failure";

/**
 * States: *a persistent toast on solid `ground` inside a `2px` `accent` border —
 * `420px` bottom-right on desktop, full-bleed above the tab bar on phone. Heading at
 * Control size (`text-bill-xs`, sans 600, since issue #396) in `accent`, the affected
 * title and episode named in full, a solid *Try again*, a ghost *Dismiss*, and a
 * copyable reference id. It does not auto-dismiss.*
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
 * screen — exactly one technical string is allowed anywhere, and it is the
 * reference id.
 *
 * ── It leaves visibly now, and that is this file's own state, not the store's — #333 ──
 *
 * `writeFailures` still raises, resolves and dismisses exactly as it always did — nothing
 * here changes when a failure leaves `writeFailures.get()`'s array. What changes is when
 * this component lets the DOM node *for* it go: `useRetainedFailures` below keeps a
 * failure rendered, with `data-leaving="true"` and `write-failure-toast-transition`
 * (`app/globals.css`) doing the fading, until its own `transitionend` reports the exit is
 * actually over. React's own unmount is immediate and cannot be told to wait for a CSS
 * transition, which is the one thing a toast that "gains an entrance and an exit" needs.
 */
function useRetainedFailures(
  current: readonly RaisedWriteFailure[],
): {
  readonly retained: readonly RaisedWriteFailure[];
  readonly isLeaving: (id: string) => boolean;
  readonly settle: (id: string) => void;
} {
  const [retained, setRetained] = useState(current);
  // React's own "adjust state during rendering" shape, not an effect: comparing against
  // the previous `current` here (rather than in a `useEffect`) is what lets a failure
  // that both arrives and leaves inside one tick — raised, then immediately resolved —
  // still get one render with it present, instead of an effect running one paint late.
  const [previousCurrent, setPreviousCurrent] = useState(current);

  if (current !== previousCurrent) {
    setPreviousCurrent(current);
    const retainedIds = new Set(retained.map((failure) => failure.id));
    const arriving = current.filter((failure) => !retainedIds.has(failure.id));
    // Never removes here — a failure that dropped out of `current` stays in `retained`
    // exactly until `settle` below takes it out, which is what gives it somewhere to play
    // its exit. Removing it here the moment `current` changed would be the bug this hook
    // exists to fix, one line further down.
    if (arriving.length > 0) setRetained((prev) => [...prev, ...arriving]);
  }

  const currentIds = new Set(current.map((failure) => failure.id));

  return {
    retained,
    isLeaving: (id) => !currentIds.has(id),
    settle: (id) => setRetained((previous) => previous.filter((failure) => failure.id !== id)),
  };
}

export function WriteFailureToasts() {
  const failures = useSyncExternalStore(
    writeFailures.subscribe,
    writeFailures.get,
    writeFailures.get,
  );
  const { retained, isLeaving, settle } = useRetainedFailures(failures);

  if (retained.length === 0) return null;

  return (
    <div
      // `pointer-events-none` on the region, restored on each toast: the container spans a
      // corner of the viewport even when it holds one short toast, and it must not swallow
      // clicks on whatever is underneath it.
      //
      // `--tab-bar-height` (`globals.css`) lifts this above the tab bar. It used to be a
      // hand-kept `bottom-[49px]` against a `TAB_BAR_HEIGHT_PX` export that said `54`,
      // because — as the comment here then said — "a Tailwind utility class and an
      // exported number cannot share one literal". True, and the conclusion was the wrong
      // way round: the fix is to put the number somewhere a class *can* read rather than
      // to copy it by hand and hope. Both copies had already drifted five pixels by the
      // time the linen redesign found them. Issue #102 built the bar this was written to
      // wait for; this is that lift.
      className="pointer-events-none fixed inset-x-0 bottom-[var(--tab-bar-height)] z-40 flex flex-col gap-px lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[420px]"
    >
      {retained.map((failure) => (
        <WriteFailureToast
          key={failure.id}
          failure={failure}
          leaving={isLeaving(failure.id)}
          onLeft={() => settle(failure.id)}
        />
      ))}
    </div>
  );
}

function WriteFailureToast({
  failure,
  leaving,
  onLeft,
}: {
  readonly failure: RaisedWriteFailure;
  readonly leaving: boolean;
  /** The exit transition finished; this failure's own node can go now. */
  readonly onLeft: () => void;
}) {
  return (
    <div
      // Assertive, unlike the offline banner: this is the result of something the reader
      // just did, and it says that the thing did not happen.
      role="alert"
      data-leaving={leaving ? "true" : undefined}
      // `opacity` and `transform` finish together, off the same duration — gating on one
      // property name is what keeps `onLeft` from firing twice for the one exit.
      onTransitionEnd={(event) => {
        if (leaving && event.target === event.currentTarget && event.propertyName === "opacity") {
          onLeft();
        }
      }}
      className="write-failure-toast-transition pointer-events-auto border-2 border-accent bg-ground p-4"
    >
      <h2 className="text-bill-xs font-semibold text-accent">That did not save</h2>

      {/* Named in full, both of them, and set as their own block rather than folded into
          the sentence. Episodes have real names — "Season 2, Episode 4 —
          Woe's Hollow" — and a sentence with one of those inside it collides with its own
          punctuation and stops being readable at exactly the moment it matters. */}
      <p className="mt-3 text-item text-text">{failure.title}</p>
      {failure.episode ? (
        <p className="text-item text-dim">{failure.episode}</p>
      ) : null}

      <p className="mt-3 text-note leading-relaxed text-text">
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
