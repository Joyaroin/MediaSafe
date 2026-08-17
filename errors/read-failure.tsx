"use client";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "./failure-treatment";
import { GHOST_RECOVERY } from "./recovery-buttons";
import { ReferenceLine } from "./reference-line";

/**
 * The read-failure treatment, per DESIGN.md's States section: inline, left-aligned, a
 * `2px` `signal` top border, the heading at `text-bill-md` in `signal`, a ghost *Try
 * again*, and a dim tabular reference id.
 *
 * ── Why it looks nothing like an empty state ──────────────────────────────────────
 *
 * This is the whole point of the component, and it is why every one of those choices is
 * the opposite of the empty and zero-match treatments rather than merely different from
 * them. Those two are **centred**, with the heading in **`stock`** and no border at all.
 * This one is **left-aligned**, with the heading in **`signal`** under a **`2px` `signal`
 * rule** — the only place in the application where vermilion appears without a watch
 * having been recorded.
 *
 * `tvtracker` is the reason. A failed read there returned `[]` and rendered the empty
 * library, so a database that was down and a library that was empty were the same screen.
 * SPEC.md §3.2 makes them structurally separate in the data path; this component is what
 * makes them separate on the glass. Do not centre it, do not soften the border, and do not
 * reuse the empty state's heading colour here.
 */
export function ReadFailure({
  reference,
  retry,
}: {
  /** The Sentry event id, or `null` when Sentry is not configured. */
  reference: string | null;
  retry: () => void;
}) {
  return (
    <section className={FAILURE_SECTION}>
      <h2 className={FAILURE_HEADING}>This did not load</h2>

      <p className={FAILURE_PROSE}>
        Something went wrong while MediaSafe was reading this. Nothing in your library has
        changed, and nothing has been lost. Try again — and if it keeps happening, the
        reference below identifies this exact failure.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={retry} className={GHOST_RECOVERY}>
          Try again
        </button>

        {reference === null ? null : <ReferenceLine reference={reference} />}
      </div>
    </section>
  );
}
