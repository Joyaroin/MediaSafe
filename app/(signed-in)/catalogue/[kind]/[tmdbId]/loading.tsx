import { BackBar } from "@/app/(signed-in)/back-bar";
import { PendingLine } from "@/app/pending-line";

/**
 * An unowned title's detail, still reading — a route whose heading is itself the answer.
 *
 * What `error.tsx` renders, less the failure — the back bar and no `<h1>`,
 * because `{detail.name}` is exactly the thing being waited for. No poster either: nothing
 * has been handed to this segment on a cold route render, unlike the desktop pane's
 * `loading` frame, which mounts one from a fact the tile it was pressed from already held.
 */
export default function UnownedTitleLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BackBar />

      <div className="px-gutter py-5">
        <PendingLine shape="detail" held />
      </div>
    </main>
  );
}
