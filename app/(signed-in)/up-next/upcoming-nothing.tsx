import type { ReactNode } from "react";
import { EMPTY_PANEL } from "@/app/buttons";

/**
 * Upcoming with nothing on it — issue #251, and the handoff's own named state rather than
 * a blank second page.
 *
 * ── Why this is not `UpNextNothing`'s sentence ──────────────────────────────────────
 *
 * The two answer different questions. `UpNextNothing`'s *nothing queued for tonight* is
 * Tonight's — no next episode and no film on the watchlist. This is Coming up's: **nothing
 * you are watching has a future date announced**, which a reader can be in while Tonight
 * is full.
 *
 * These read differently and must not share copy, and
 * the copy below is the prototype's states column verbatim — *No release dates yet* /
 * *Nothing you keep has a date announced*, which #245 makes binding.
 *
 * ── Reachable only from a read that succeeded ───────────────────────────────────────
 *
 * A failure throws past this into the route's `error.tsx`, which draws the read-failure
 * treatment with a reference id over the same heading. This is the surface `AGENTS.md`'s
 * rule bites hardest on, and *no release dates yet* is exactly the plausible lie it
 * forbids: every row absent, nothing on screen saying the database is down.
 *
 * ── No recovery control ─────────────────────────────────────────────────────────────
 *
 * `UpNextNothing` offers *Search the catalogue*, because an empty landing screen is
 * usually an empty library and adding a title is the thing to do about it. There is no
 * equivalent here: a reader whose shows simply have no announced episodes has nothing to
 * press, and a button offering to fix a thing that is not broken is worse than no button.
 *
 * Centred, `text-bill-lg` in `text`, no border — `UpNextNothing`'s shape, and the opposite
 * of `errors/read-failure.tsx`'s left-aligned `accent` treatment, so the two can never be
 * mistaken for each other.
 */
export function UpcomingNothing({
  suggestions = null,
}: {
  /** Issue #365: the same rail of titles to add that Up next's empty state draws. */
  suggestions?: ReactNode;
}) {
  return (
    <>
      <section className={EMPTY_PANEL}>
        <h2 className="bill-title text-bill-lg text-text">No release dates yet</h2>

        <p className="mt-2 max-w-[60ch] text-note leading-relaxed text-dim">
          Nothing you keep has a date announced.
        </p>
      </section>
      {suggestions}
    </>
  );
}
