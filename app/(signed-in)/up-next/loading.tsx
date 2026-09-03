import { ProgrammeNoteLayout } from "@/app/(signed-in)/library/programme-note-layout";
import { PendingLine } from "@/app/pending-line";
import { requireTimezone } from "@/lib/session";
import { UpNextHeading } from "./up-next-heading";

/**
 * Up next, which is still reading — the one boundary in this ticket that is a region, not
 * a whole surface, because this route renders two panes.
 *
 * ── Why this is not `library/loading.tsx`'s shape ────────────────────────────────────
 *
 * `page.tsx` never renders a bare `<main>`: it wraps its content in `ProgrammeNoteLayout`,
 * the same two-pane shell `library/page.tsx` uses, so the desktop reader sees the rails on
 * the left and the programme note pane on the right. A `loading.tsx` that skipped the
 * layout — the formula every other radius-1 file in this ticket follows — would replace
 * the whole shell with a single column while pending, then swap to two columns the instant
 * the read resolved: exactly the blink issue #181 names by name. Wrapping the pending
 * content in the identical layout is what keeps the pane's column in place throughout,
 * so only the rails region is ever waiting.
 *
 * The pane itself needs nothing built for it here. `ProgrammeNotePane` reads
 * `useLibrarySelection()`, which this fresh `LibrarySelectionProvider` instance seeds to
 * `null` — its already-built `idle` phase (`programme-note.tsx`) renders *Select an entry
 * from the bill to read it here* at full strength, unprompted by anything this file does.
 * That is radius 2 exactly as `DESIGN.md` §9 states it: the region beside the pending one
 * renders in its own settled form, and nothing here reserves space for it or waits on it.
 *
 * ── Why the rails still get the whole-surface treatment ───────────────────────────────
 *
 * §9 also settles that the rails are radius 1, not radius 2, on their own account:
 * `listUpNextRails` returns one value for all three groups, so they cannot resolve
 * separately and a boundary around one would be a boundary around nothing. One dim line
 * under the heading is the whole of what is pending on the left, on both
 * devices — `UpNextPhoneRails` and `UpNextRailsSurface` are two renders of the one read
 * this boundary is standing in for, not two reads with two states to draw. (#250 replaced
 * the phone's five vertical groups with two rails; it did not change how many reads are
 * behind them, which is why this file did not otherwise move.)
 *
 * ── The heading still reads the account's hour here (issue #319) ─────────────────────
 *
 * `requireTimezone()` is cheap to call again: `lib/session.ts`'s `currentSession` is
 * wrapped in React's `cache()`, scoped to this one render, so this pays no second query —
 * the masthead above this boundary has already resolved the same session. This file is a
 * plain Server Component (unlike `error.tsx`, which Next.js requires to be a Client
 * Component), so it is one of the two places, beside `page.tsx`, that can read the
 * account's zone at all.
 */
export default async function UpNextLoading() {
  const zone = await requireTimezone();

  return (
    <ProgrammeNoteLayout>
      <div className="flex min-w-0 flex-1 flex-col">
        <UpNextHeading zone={zone} at={new Date()} />

        <div className="px-6 py-5">
          <PendingLine shape="rail" held />
        </div>
      </div>
    </ProgrammeNoteLayout>
  );
}
