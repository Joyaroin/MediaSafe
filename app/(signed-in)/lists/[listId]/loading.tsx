import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { BackToListsBar } from "../back-to-lists-bar";

/**
 * One list, still reading — a route whose heading is itself the answer.
 *
 * The rule: *`loading.tsx` renders what the segment's `error.tsx` already renders,
 * less the failure.* `error.tsx` renders the back bar and no `<h1>` at all, because
 * `{detail.name}` is exactly the thing being waited for — the identical shape
 * `titles/[entryId]/loading.tsx` follows for the same reason.
 *
 * This file exists because a boundary above it would speak for it: without it, this route
 * would show `lists/loading.tsx`'s *Lists* heading over one list's own page.
 */
export default function ListDetailLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <BackToListsBar />

      {/* The list's name, then one screen of its rows — a position, a `40px` poster and a
          name and meta line — the row view it opens in (`app/skeleton.tsx`). */}
      <SkeletonRegion className="gap-0 px-gutter pt-3 pb-5 lg:px-10">
        <Block className="h-12 w-56" />
        <div className="mt-3 flex items-center justify-between">
          <Block className="h-3 w-16" />
          <Block className="h-11 w-36 [--poster-radius:var(--radius-5)]" />
        </div>
        <ul className="mt-5 flex flex-col">
          {ROWS.map((width) => (
            <li key={width} className="flex min-h-[76px] items-center gap-3 border-b border-hair py-2">
              <Block className="h-4 w-6 shrink-0" />
              <PosterBlock className="w-10 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <Block className={`h-4 ${width}`} />
                <Block className="h-2.5 w-24" />
              </span>
            </li>
          ))}
        </ul>
      </SkeletonRegion>
    </main>
  );
}

const ROWS = ["w-[62%]", "w-[48%]", "w-[71%]", "w-[55%]", "w-[66%]"];
