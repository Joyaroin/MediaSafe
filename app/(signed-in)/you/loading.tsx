import { PendingLine } from "@/app/pending-line";
import { YouHeading } from "./you-heading";

/**
 * You, which is still reading.
 *
 * Radius 1: `loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure — the same `<main>`, the same `YouHeading`, and one dim line
 * where `ReadFailure` would be. `lists/loading.tsx` is the same shape.
 *
 * The boundary is on this segment rather than on the shell, for `library/loading.tsx`'s
 * own reason: `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar,
 * and a reader who cannot leave a slow screen is worse off than one watching a frozen one.
 *
 * **The hero is not drawn here either.** It could be — the session is a server read this
 * boundary's page will make anyway — but a `loading.tsx` renders before that page runs at
 * all, so it has nothing to draw the name from. One pending line under the heading is the
 * honest amount of this screen to promise.
 */
export default function YouLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <YouHeading />

      <div className="px-gutter py-5 lg:px-10">
        <PendingLine shape="rows" held />
      </div>
    </main>
  );
}
