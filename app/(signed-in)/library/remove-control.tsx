import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The way a title leaves your library — issue #142, and the only entry point to the
 * confirmation that removes it.
 *
 * ── Title detail, and nowhere else ───────────────────────────────────────────────────
 *
 * Never a tile, never a rail, never a grid cell, never a swipe. That is the ticket's first
 * acceptance criterion and it is a rule about the whole repository rather than about this
 * render, so it is checked as one in `tests/remove-from-library-control.test.ts`, which
 * walks every importer under `app/` rather than trusting a file list. The reason is worth
 * stating rather than inheriting: an action that destroys years
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
 * ── Distinct from giving up on a title, which is a promise this still has to keep ────
 *
 * There was a control beside this one that abandoned a title, and **the ticket existed to
 * stop the two reading as the same thing**: abandoning keeps your history and is undone by
 * watching the show again, removing destroys your history and is undone by nothing.
 *
 * That control is retired. The distinction is not: a title abandoned before it went is
 * still abandoned, the library tile still tells its reader *watching it again clears this*,
 * and this control still sits on the same screen promising the opposite. So the copy half
 * below stands exactly as it was, and it is now the only place the contrast is drawn.
 *
 * The **shape** half went with the control. It said *that one is a row and this is a
 * block, so the eye does not read a pair of interchangeable rows* — a comparison that
 * needs two things to compare.
 *
 * **This control draws no gap of its own any more.** It rooted on `PROGRAMME_NOTE_SECTION`
 * while it was the second thing in a card — the rating was above it — and that `1.75rem`
 * was the rhythm between the two. The rating is retired and this is the card's only child,
 * so the same class now measures a gap between this control and the card's own top padding,
 * which is `2.75rem` of nothing above a one-line link.
 *
 * The rhythm did not go anywhere: the `<section>` in `programme-note-content.tsx` carries
 * `PROGRAMME_NOTE_SECTION` itself, as every card on that surface does, so the gap *between*
 * blocks is exactly what it was. What is gone is the second copy of it inside this one.
 *
 * That is not the hand-tuning an earlier draft was refused. That draft widened the gap to
 * `mt-10` to push this control away from the abandon row, buying a distinction the shape
 * and the copy already carry at the price of the one section rhythm on the surface — which
 * is still the rule, and is why this drops to nothing rather than to some other number.
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
    <div>
      <Link
        href={`/library/${libraryEntryId}/remove`}
        aria-label={`Remove ${titleName} from your library`}
        className={GHOST_RECOVERY}
      >
        Remove from library ›
      </Link>

      {/* The counterweight to the library tile's reassurance — *watching it again clears
          this* — in the same voice and to the opposite effect. It names both things the
          removal takes, because the confirmation
          is going to count them and a reader should not first learn what is at stake on the
          page that is about to destroy it. */}
      <p className="code-line mt-2 text-dim">
        Your watches and your rating go with it. Nothing brings them back.
      </p>
    </div>
  );
}
