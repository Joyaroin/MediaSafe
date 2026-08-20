import { PendingLine } from "@/app/pending-line";
import { BackToListsBar } from "./back-to-lists-bar";

/**
 * One list, still reading — a route whose heading is itself the answer.
 *
 * `DESIGN.md` §9: *`loading.tsx` renders what the segment's `error.tsx` already renders,
 * less the failure.* `error.tsx` renders the back bar and no `<h1>` at all, because
 * `{detail.name}` is exactly the thing being waited for — the identical shape
 * `library/[entryId]/loading.tsx` follows for the same reason.
 *
 * This file exists because a boundary above it would speak for it: without it, this route
 * would show `lists/loading.tsx`'s *Lists* heading over one list's own page.
 */
export default function ListDetailLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToListsBar />

      <div className="px-6 py-5">
        <PendingLine />
      </div>
    </main>
  );
}
