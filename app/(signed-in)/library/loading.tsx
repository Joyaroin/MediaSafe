import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { LibraryHeading } from "./library-heading";

/**
 * The library, reading — its own heading at once (a literal, not an answer, so it does not
 * wait), then the view control and two sections, each a heading and one row of posters (the screen
 * it becomes, `library-sections.tsx`). The layout's count, never the data's.
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
        {/* Two sections: a heading line and its count, then one row of posters. */}
        {[0, 1].map((section) => (
          <div key={section} className="mt-6 first:mt-2">
            <div className="flex min-h-11 items-center justify-between px-gutter lg:px-10">
              <Block className="h-2.5 w-24 [--poster-radius:var(--radius-full)]" />
              <Block className="h-4 w-8 [--poster-radius:var(--radius-full)]" />
            </div>
            <ul className="flex gap-x-3.5 overflow-hidden px-gutter lg:px-10">
              {CELLS.map((width) => (
                <li key={width} className="flex w-[7.5rem] shrink-0 flex-col gap-2 sm:w-36">
                  <PosterBlock className="w-full" radius="var(--radius-4)" />
                  <Block className={`h-2.5 ${width}`} />
                  <Block className="h-2 w-[46%]" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </SkeletonRegion>
    </main>
  );
}

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
