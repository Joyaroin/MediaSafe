import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { ROW, ROW_LIST } from "./up-next-card-styles";
import { UpNextHeading } from "./up-next-heading";

/**
 * Tonight, reading — the featured block and a screen of rows, so the wait is the page it
 * becomes (`app/skeleton.tsx` has the reasoning). The featured area at its own `344px`
 * floor (`480px` on a desktop) with *Tonight* where the painted title will sit, and five
 * rows whatever the library holds: the layout's count, never the data's.
 */
export default function UpNextLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <div className="w-full pb-8 lg:max-w-6xl lg:px-10 lg:pt-8">
        <SkeletonRegion className="gap-0">
          <div className="pending-card relative flex min-h-[344px] flex-col justify-end gap-3 px-gutter pt-6 pb-5 lg:min-h-[480px] lg:rounded-[var(--radius-6)]">
            <div className="absolute top-6 left-[var(--spacing-gutter)]">
              <UpNextHeading />
            </div>
            <Block className="h-3 w-16" />
            <Block className="h-14 w-[70%]" />
            <Block className="h-4 w-[45%]" />
            <Block className="h-14 w-full rounded-[var(--radius-5)] sm:w-[280px]" />
          </div>

          <ul className={`${ROW_LIST} mt-5 px-gutter lg:px-0`}>
            {ROWS.map((width) => (
              <li key={width} className={ROW}>
                <PosterBlock className="w-9 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Block className="h-4 w-[44%]" />
                  <Block className={`h-3 ${width}`} />
                </span>
                <Block className="mr-2 h-6.5 w-6.5 shrink-0 [--poster-radius:var(--radius-full)]" />
              </li>
            ))}
          </ul>
        </SkeletonRegion>
      </div>
    </main>
  );
}

/** The episode line's width per row, so five rows do not read as one stamped five times. */
const ROWS = ["w-[70%]", "w-[54%]", "w-[63%]", "w-[46%]", "w-[66%]"];
