import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { YOU_HEADING_ID, YouHeading } from "./you-heading";

/**
 * You, reading — the page it becomes, in place (issue #405's layout): the avatar and the
 * name with the settings button beside them, the watch-time card, the four counts, and a
 * rail of title tiles at their own `132px` (`app/skeleton.tsx` has the reasoning). The
 * figures are the layout's — one card of two rows, and four counts, because the page
 * always draws those — never a guess at the data.
 *
 * The name has not been read, so the heading is *You*, for assistive technology only;
 * what is drawn is the shape the name will arrive in.
 */
export default function YouLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <YouHeading>
        <Block className="h-16 w-16 shrink-0 [--poster-radius:var(--radius-full)]" />
        <h1 id={YOU_HEADING_ID} className="sr-only">
          You
        </h1>
        <span className="min-w-0 flex-1">
          <Block className="h-8 w-40 max-w-full" />
        </span>
      </YouHeading>

      <SkeletonRegion className="gap-0 pb-8">
        <div className="px-gutter pt-4 pb-2 lg:px-10">
          <Block className="h-7 w-36" />
          <Block className="mt-2 h-[106px] w-full [--poster-radius:var(--radius-5)]" />
        </div>

        <div className="px-gutter pt-4 pb-2 lg:px-10">
          <Block className="h-7 w-56" />
          <div className="mt-2 grid grid-cols-4 gap-3">
            {["a", "b", "c", "d"].map((key) => (
              <Block key={key} className="h-[68px] w-full" />
            ))}
          </div>
        </div>

        <div className="pt-4">
          <div className="px-gutter pb-2.5 lg:px-10">
            <Block className="h-7 w-28" />
          </div>
          <div className="flex gap-3 overflow-hidden px-gutter lg:px-10">
            {["a", "b", "c", "d", "e", "f"].map((key) => (
              <span key={key} className="flex w-[132px] shrink-0 flex-col gap-2">
                <PosterBlock className="w-full" />
                <Block className="h-2.5 w-[80%]" />
              </span>
            ))}
          </div>
        </div>
      </SkeletonRegion>
    </main>
  );
}
