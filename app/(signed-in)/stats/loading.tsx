import { PendingLine } from "@/app/pending-line";
import { StatsHeading } from "./stats-heading";

/**
 * Stats, which is still reading.
 *
 * `DESIGN.md` §9, radius 1: `loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure — the same `<main>`, the same `StatsHeading`, and one dim line
 * where `ReadFailure` would be. `lists/loading.tsx` is the shape this follows.
 *
 * It matters more here than on most surfaces. `accountStats` makes eight statements, so this
 * is one of the slower reads in the application, and it is behind a tab a reader taps from
 * anywhere. Without a boundary the previous screen would sit frozen on the glass for the
 * whole of it.
 *
 * The boundary is on this segment rather than on the shell, for `library/loading.tsx`'s own
 * reason: `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar, and a
 * reader who cannot leave a slow screen is worse off than one watching a frozen one.
 */
export default function StatsLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <StatsHeading />

      <div className="px-6 py-5">
        <PendingLine />
      </div>
    </main>
  );
}
