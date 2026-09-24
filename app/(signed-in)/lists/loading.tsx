import { PendingLine } from "@/app/pending-line";
import { ListsHeading } from "./lists-heading";

/**
 * The Lists destination, which is still reading.
 *
 * Radius 1: `loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure — the same `<main>`, the same `ListsHeading`, and one dim line
 * where `ReadFailure` would be. `ListsHeading` is already shared by the populated screen
 * and the failure boundary for the reason its own docblock gives; this is that component's
 * third caller, and the sentence it makes true is *Lists, which is still reading*.
 *
 * The boundary sits on this segment rather than the shell for `library/loading.tsx`'s own
 * reason: `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar, and a
 * reader who cannot leave a slow screen is worse off than one watching a frozen one.
 */
export default function ListsLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <ListsHeading />

      <div className="px-6 py-5">
        <PendingLine shape="rows" held />
      </div>
    </main>
  );
}
