"use client";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "./failure-treatment";
import { GHOST_RECOVERY } from "./recovery-buttons";
import { ReferenceLine } from "./reference-line";

/**
 * The read-failure treatment — Charcoal (issue #397, handoff §9): inline, left-aligned, in
 * the outlined panel (`failure-treatment.ts`), a Row-size sans heading in `text`, the
 * sentence that says nothing else was affected, a quiet *Try again*, and a dim tabular
 * reference id.
 *
 * ── Why it must never read as an empty state ──────────────────────────────────────
 *
 * Since Charcoal both sit in an outlined panel, so the difference is carried by what is
 * in it, and every piece of it is the opposite of the empty treatment: an empty state's
 * heading is the serif at Heading size and says the place is *empty*; this one's is the
 * sans at Row size and says the place *did not load*, and it carries the two things no
 * empty state ever has — a way to try again and the reference id.
 *
 * `tvtracker` is the reason. A failed read there returned `[]` and rendered the empty
 * library, so a database that was down and a library that was empty were the same screen.
 * The rule makes them structurally separate in the data path; this component is what
 * makes them separate on the glass. Do not drop *Try again* or the reference, and do not
 * give it the empty state's serif heading.
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
