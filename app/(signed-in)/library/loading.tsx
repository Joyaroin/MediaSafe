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
      <LibraryHeading />
      <SkeletonRegion className="gap-0">
        <div className="px-gutter lg:px-10">
          <Block className="mt-4 h-[42px] w-full [--poster-radius:var(--radius-full)] lg:max-w-[420px]" />
          <div className="mt-4 flex gap-2">
            {CHIPS.map((width) => (
              <Block key={width} className={`h-9 ${width} [--poster-radius:var(--radius-full)]`} />
            ))}
          </div>
        </div>
        <ul className={`mt-5 ${LIBRARY_GRID}`}>
          {CELLS.map((width) => (
            <li key={width} className="flex flex-col gap-2">
              <PosterBlock className="w-full" radius="var(--radius-4)" />
              <Block className={`h-2.5 ${width}`} />
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
