import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { ComingUpHeading } from "./coming-up-heading";

/**
 * Coming up, reading — its heading, one day heading and a screen of rows in the shape
 * `upcoming-row.tsx` draws (Charcoal §8.2), so the wait is the page it becomes
 * (`app/skeleton.tsx` has the reasoning). Six rows whatever the reader holds: the layout's
 * count, never the data's.
 */
export default function ComingUpLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <ComingUpHeading />
      <div className="w-full lg:max-w-6xl">
        <SkeletonRegion className="gap-0 px-gutter lg:max-w-3xl">
          <div className="flex items-baseline justify-between pt-3.5 pb-1.5">
            <Block className="h-6 w-28" />
            <Block className="h-3 w-16" />
          </div>
          <ul>
            {ROWS.map((width) => (
              <li
                key={width}
                className="flex h-16 items-center gap-3 not-last:border-b not-last:border-hair lg:h-[68px]"
              >
                <PosterBlock className="w-9 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Block className={`h-4 ${width}`} />
                  <Block className="h-3 w-[34%]" />
                </span>
              </li>
            ))}
          </ul>
        </SkeletonRegion>
      </div>
    </main>
  );
}

/** The title's width per row, so six rows do not read as one stamped six times. */
const ROWS = ["w-[52%]", "w-[40%]", "w-[61%]", "w-[46%]", "w-[56%]", "w-[44%]"];
