import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { YouHeading } from "./you-heading";

/**
 * You, reading — its heading at once, then the page it becomes: the avatar and name, the
 * two watch-time figures, the four counts, and a rail of title tiles at their own `132px`
 * (`app/skeleton.tsx` has the reasoning). The figures are the layout's — two and four,
 * because the page always draws two and four — never a guess at the data.
 */
export default function YouLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <YouHeading />
      <SkeletonRegion className="gap-0 pb-8">
        <div className="flex items-center gap-4 px-gutter pt-5 pb-2 lg:px-10 lg:pt-7">
          <Block className="h-[84px] w-[84px] shrink-0 [--poster-radius:var(--radius-full)]" />
          <Block className="h-6 w-40" />
        </div>

        <div className="px-gutter py-4 lg:px-10">
          <Block className="h-2.5 w-24" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Block className="h-[84px] w-full [--poster-radius:var(--radius-6)]" />
            <Block className="h-[84px] w-full [--poster-radius:var(--radius-6)]" />
          </div>
        </div>

        <div className="px-gutter py-4 lg:px-10">
          <Block className="h-2.5 w-36" />
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {["a", "b", "c", "d"].map((key) => (
              <Block key={key} className="h-[84px] w-full [--poster-radius:var(--radius-6)]" />
            ))}
          </div>
        </div>

        <div className="pt-2">
          <div className="px-gutter pb-3 lg:px-10">
            <Block className="h-4 w-20" />
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
