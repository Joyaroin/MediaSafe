import Link from "next/link";
import type { ReactNode } from "react";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { EMPTY_PANEL } from "@/app/buttons";

/**
 * The landing screen with **nothing on it at all** — issue #250, and the handoff's own
 * named state rather than a blank page.
 *
 * ── Not an empty list ───────────────────────────────────────────────────────────────
 *
 * #245 settled that an empty list and an empty screen are different facts. A list with
 * nothing on it is simply *absent* (`tonight-list.tsx` renders `null`); **a screen with no
 * next episode and no film on the watchlist gets this sentence**, on every screen size,
 * decided by `up-next-rails.tsx`.
 *
 * ── The copy is the prototype's, verbatim ───────────────────────────────────────────
 *
 * *Nothing queued for tonight* / *Add a show and its next episode turns up here* /
 * *Search the catalogue* — the prototype's states column,
 * which #245 makes binding. It is deliberately not `empty-library.tsx`'s *Your library is
 * empty* nor `upcoming-nothing.tsx`'s *No release dates yet*: these read differently and
 * must not share copy.
 *
 * Reachable **only from reads that succeeded**. A failure throws past this into the
 * route's `error.tsx`, which draws the read-failure treatment with a reference id. This is
 * the surface `AGENTS.md`'s rule bites hardest on, and *nothing queued for tonight* is
 * exactly the plausible lie it forbids.
 *
 * Centred, `text-bill-lg` in `text`, no border — `empty-library.tsx`'s shape, and the opposite of `errors/read-failure.tsx`'s left-aligned `accent` treatment,
 * so the two can never be mistaken for each other.
 */
export function UpNextNothing({
  suggestions,
}: {
  /** Issue #365's rail of titles to add (`suggestion-rail.tsx`), drawn under the
   *  sentence. It answers its own failure inline, so the sentence never depends on it. */
  suggestions: ReactNode;
}) {
  return (
    <>
      <section className={EMPTY_PANEL}>
        <h2 className="bill-title text-bill-lg text-text">Nothing queued for tonight</h2>

        <p className="mt-2 max-w-[60ch] text-note leading-relaxed text-dim">
          Add a show and its next episode turns up here.
        </p>

        <Link href="/search" className={`mt-4 ${SOLID_RECOVERY}`}>
          Search films and shows
        </Link>
      </section>
      {/* Room between the panel and the rail under it — the rail carries no top space of
          its own, because Coming up's empty state draws it under a panel too. */}
      <div className="mt-6">{suggestions}</div>
    </>
  );
}
