import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { LibraryHeading } from "./library-heading";
import { LIBRARY_GRID } from "./library-grid";

/**
 * The library, reading — its own heading at once (a literal, not an answer, so it does not
 * wait), then the view control and one screen of the poster grid it becomes, in
 * `LIBRARY_GRID`'s own columns (`app/skeleton.tsx` has the reasoning). Twelve cells
 * whatever the library holds: the layout's count, never the data's.
 */
export default function LibraryLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <LibraryHeading
        control={
          // The pending shimmer without a second `role="status"`: the region below is
          // the one that announces *Reading*.
          <div className="pending route-pending-hold mt-4 lg:mt-0">
            <Block className="h-[52px] w-full [--poster-radius:var(--radius-5)] lg:w-[340px]" />
          </div>
        }
      />
      <SkeletonRegion className="gap-0">
        {/* The chips, then the round sort button pinned at the row's right end. */}
        <div className="mt-2 flex items-center gap-2 px-gutter py-1 lg:mt-4 lg:px-10">
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
            {CHIPS.map((width) => (
              <Block key={width} className={`h-9 shrink-0 ${width} [--poster-radius:var(--radius-full)]`} />
            ))}
          </div>
          <Block className="h-11 w-11 shrink-0 [--poster-radius:var(--radius-full)] lg:w-40" />
        </div>
        <ul className={`mt-5 ${LIBRARY_GRID}`}>
          {CELLS.map((width) => (
            <li key={width} className="flex flex-col gap-2">
              <PosterBlock className="w-full" radius="var(--radius-4)" />
              <Block className={`h-2.5 ${width}`} />
              <Block className="h-2 w-[46%]" />
            </li>
          ))}
        </ul>
      </SkeletonRegion>
    </main>
  );
}

const CHIPS = ["w-12", "w-20", "w-[88px]", "w-16"];

/** The name line's width per cell, varied so the grid does not read as one cell stamped. */
const CELLS = [
  "w-[82%]",
  "w-[64%]",
  "w-[74%]",
  "w-[58%]",
  "w-[88%]",
  "w-[69%]",
  "w-[77%]",
  "w-[61%]",
  "w-[84%]",
  "w-[56%]",
  "w-[72%]",
  "w-[66%]",
];
