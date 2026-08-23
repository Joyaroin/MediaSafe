import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";

/**
 * The way a title leaves your library — issue #142, and the only entry point to the
 * confirmation that removes it.
 *
 * ── Title detail, and nowhere else ───────────────────────────────────────────────────
 *
 * Never a tile, never a rail, never a grid cell, never a swipe. That is the ticket's first
 * acceptance criterion and it is a rule about the whole repository rather than about this
 * render, so it is checked as one in `tests/remove-from-library-control.test.ts` — the shape
 * `tests/rating-control.test.ts` already uses for *the rating is on title detail and nowhere
 * else*. The reason is worth stating rather than inheriting: an action that destroys years
 * of watches and cannot be undone must never sit under a gesture somebody makes while
 * scrolling.
 *
 * ── It navigates, and the navigation is the ceremony ─────────────────────────────────
 *
 * A `Link`, not a button — nothing is written from here. The press leads to
 * `library/[entryId]/remove`, which reads this title's real watch count and rating from the
 * database and asks. That page's own docblock carries the argument for why it is a page
 * rather than a dialog; what matters here is that this control cannot destroy anything on
 * its own, so a mis-tap costs a navigation and nothing else.
 *
 * ── It navigates on desktop too, and the Never-Navigate-Away Rule still holds ───────
 *
 * `DESIGN.md`: *on desktop, inspecting a candidate replaces the programme note's contents
 * and leaves the bill exactly where it was — nothing about **browsing your season** should
 * cost you your place in it.* That rule is about browsing, and this is the one act on the
 * pane that is not browsing. It is also the act the ticket most wants taken off the pane: a
 * dialog is dismissed and a page is left, and the confirmation has to be a page because the
 * numbers have nowhere else to go. So the desktop reader loses their place in the bill
 * exactly once, on the way to destroying something, and `remove-title-form.tsx` puts them
 * back on `/library` afterwards.
 *
 * ── Distinct from the abandon control, deliberately and in two ways ──────────────────
 *
 * They used to sit near each other, and **the ticket existed to stop them reading as the
 * same thing** even so: abandoning keeps your history and is undone by watching the show
 * again, removing destroys your history and is undone by nothing. Issue #228 moves the
 * abandon control up beside the state line and leaves this one at the foot of the pane, so
 * the two are no longer adjacent — but the difference stays carried twice below, because a
 * reader who has seen one still has to tell the other apart from memory rather than from
 * position on the page.
 *
 * *In shape.* `AbandonControl` is one row — a text button with its reassurance set opposite,
 * on the same baseline. This is a block: the link on its own line with the consequence
 * underneath it. Two different constructs, so the eye does not read a pair of
 * interchangeable rows.
 *
 * The gap above is `PROGRAMME_NOTE_SECTION` and not a wider one written by hand. A first
 * draft of this control widened it to `mt-10` to push the two apart, which is `2.5rem`
 * against the `1.75rem` `DESIGN.md`'s Layout fixes for every block in this pane — buying a
 * distinction the shape and the copy already carry, at the price of the one section rhythm
 * on the surface. Distinctness is not a spacing problem here.
 *
 * *In copy.* The slot that holds *Watching it again clears it* on the abandon row holds
 * *Nothing brings them back* here. Same position in the sentence, opposite promise, and it
 * is the honest one: `SPEC.md`'s caveat is that watches this application recorded are
 * restorable by no means at all, in the product or out of it.
 *
 * ── No longer quiet, and the accent is spent knowingly ────────────────────────────────
 *
 * The accent is reserved for recording a watch — `app/globals.css` since issue #134, which
 * replaced the vermilion this rule was first written about with the Catalogue Wall's amber
 * and left the reservation exactly as it was. This control used to take neither border nor
 * fill nor icon rather than compete with that reservation. Issue #195 spends it anyway,
 * knowingly and by name — `GHOST_RECOVERY`, the register the whole underline conversion
 * reuses (`DESIGN.md` §12 owes a ticket to settle what the accent means; this adds to that
 * question rather than resolving it). Loudness is still not what protects a reader here —
 * the confirmation's real numbers are, and they are one navigation away — but the control
 * has to read as pressable to get there at all.
 */
export function RemoveControl({
  libraryEntryId,
  titleName,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
}) {
  return (
    <div className={PROGRAMME_NOTE_SECTION}>
      <Link
        href={`/library/${libraryEntryId}/remove`}
        aria-label={`Remove ${titleName} from your library`}
        className={GHOST_RECOVERY}
      >
        Remove from library ›
      </Link>

      {/* The counterweight to the abandon row's reassurance, in the same voice and to the
          opposite effect. It names both things the removal takes, because the confirmation
          is going to count them and a reader should not first learn what is at stake on the
          page that is about to destroy it. */}
      <p className="code-line mt-2 text-dim">
        Your watches and your rating go with it. Nothing brings them back.
      </p>
    </div>
  );
}
