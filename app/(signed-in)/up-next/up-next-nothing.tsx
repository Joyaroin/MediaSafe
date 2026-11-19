import Link from "next/link";

import { GHOST_RECOVERY, SOLID_RECOVERY } from "@/errors/recovery-buttons";
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
 * ── No rail of titles to add (issue #556) ───────────────────────────────────────────
 *
 * Issue #365 drew a trending rail under this panel. The spec ("Search before you type")
 * moved trending to Search, so this screen points there instead: the one filled button
 * is *Search films and shows*, and *Bring your library in* sits beside it only when the
 * library is empty (`libraryEmpty`, answered by `up-next-rails.tsx` from a read that
 * succeeded — a failed read throws, it is never an empty library).
 *
 * Centred, `text-bill-lg` in `text`, no border — `empty-library.tsx`'s shape, and the opposite of `errors/read-failure.tsx`'s left-aligned `accent` treatment,
 * so the two can never be mistaken for each other.
 */
export function UpNextNothing({ libraryEmpty }: { libraryEmpty: boolean }) {
  return (
    <section className={EMPTY_PANEL}>
      <h2 className="bill-title text-bill-lg text-text">Nothing queued for tonight</h2>

      <p className="mt-2 max-w-[60ch] text-note leading-relaxed text-dim">
        Add a show and its next episode turns up here.
      </p>

      {/* Search is the one filled button. Bringing a library in is offered only to a
          reader who has none: with titles held, an import is not the way out of an empty
          Tonight. */}
      <div className="mt-4 flex flex-col gap-1">
        <Link href="/search" className={SOLID_RECOVERY}>
          Search films and shows
        </Link>
        {libraryEmpty ? (
          <Link href="/import" className={GHOST_RECOVERY}>
            Bring your library in
          </Link>
        ) : null}
      </div>
    </section>
  );
}
