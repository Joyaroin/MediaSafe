import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { ComingUpHeading } from "./coming-up-heading";

/**
 * Coming up, reading — its heading, the episodes label and one screen of rows in the
 * shape `upcoming-row.tsx` draws, so the wait is the page it becomes (`app/skeleton.tsx`
 * has the reasoning). Six rows whatever the reader holds: the layout's count, never the
 * data's.
 */
export default function ComingUpLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <ComingUpHeading />
      <div className="w-full lg:max-w-6xl">
        <SkeletonRegion className="gap-0">
          <div className="px-gutter pt-[26px] pb-1">
            <Block className="h-3 w-32" />
          </div>
          <ul className="mt-2.5 flex flex-col gap-2 px-gutter">
            {ROWS.map((width) => (
              <li key={width} className="pending-card flex items-center gap-3 p-2.5">
                <PosterBlock className="w-14 shrink-0" radius="var(--radius-4)" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Block className="h-4 w-[52%]" />
                  <Block className={`h-3 ${width}`} />
                  <Block className="h-2.5 w-[30%]" />
                </span>
              </li>
            ))}
          </ul>
        </SkeletonRegion>
      </div>
    </main>
  );
}

/** The episode line's width per row, so six rows do not read as one stamped six times. */
const ROWS = ["w-[70%]", "w-[54%]", "w-[63%]", "w-[46%]", "w-[66%]", "w-[58%]"];
