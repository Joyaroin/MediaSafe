import Link from "next/link";

import { EMPTY_PANEL } from "@/app/buttons";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

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
 * ── A link to Search, and no rail (issue #556) ──────────────────────────────────────
 *
 * Issue #365 drew a trending rail under this panel; the spec moved trending to Search, so
 * this screen links there instead. It is a plain secondary link, not a filled button: a
 * reader whose shows simply have no announced episodes is not in trouble, and Tonight's
 * empty screen owns the one filled *Search films and shows*.
 *
 * Centred, `text-bill-lg` in `text`, no border — `UpNextNothing`'s shape, and the opposite
 * of `errors/read-failure.tsx`'s left-aligned `accent` treatment, so the two can never be
 * mistaken for each other.
 */
export function UpcomingNothing() {
  return (
    <section className={EMPTY_PANEL}>
      <h2 className="bill-title text-bill-lg text-text">No release dates yet</h2>

      <p className="mt-2 max-w-[60ch] text-note leading-relaxed text-dim">
        Nothing you keep has a date announced.
      </p>

      <Link href="/search" className={`mt-4 ${GHOST_RECOVERY}`}>
        Search films and shows
      </Link>
    </section>
  );
}
