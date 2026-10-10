import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { CARD_GRID } from "./up-next-card-styles";
import { UpNextHeading } from "./up-next-heading";

/**
 * Up next, reading — the pager's two labels and one screen of cards in the card grid, so
 * the wait is the page it becomes (`app/skeleton.tsx` has the reasoning). Six cards
 * whatever the library holds: the layout's count, never the data's.
 */
export default function UpNextLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <UpNextHeading />
      <div className="w-full lg:max-w-6xl">
        <SkeletonRegion className="gap-0">
          <div className="flex gap-[26px] px-gutter pt-[18px] pb-[11px]">
            <Block className="h-3 w-16" />
            <Block className="h-3 w-20" />
          </div>
          <ul className={`${CARD_GRID} mt-4`}>
            {CARDS.map((width) => (
              <li key={width} className="pending-card flex items-center gap-3 p-2.5">
                <PosterBlock className="w-14 shrink-0" radius="var(--radius-4)" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Block className="h-2.5 w-[38%]" />
                  <Block className="h-4 w-[52%]" />
                  <Block className={`h-3 ${width}`} />
                </span>
                <Block className="mr-2 h-7 w-7 shrink-0 [--poster-radius:var(--radius-full)]" />
              </li>
            ))}
          </ul>
        </SkeletonRegion>
      </div>
    </main>
  );
}

/** The episode-name line's width per card, so six cards do not read as one stamped six times. */
const CARDS = ["w-[70%]", "w-[54%]", "w-[63%]", "w-[46%]", "w-[66%]", "w-[58%]"];
