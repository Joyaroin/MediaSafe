import { Block, PosterBlock, SkeletonRegion } from "@/app/skeleton";
import { SearchHeading } from "./search-heading";

/**
 * Search, reading — its heading at once, then the field and one recommendation rail at the
 * rail's own `124px` tiles, which is what the page opens to before anything is typed
 * (`app/skeleton.tsx` has the reasoning).
 */
export default function SearchLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-gutter pt-5 pb-12 lg:pb-16">
      <SearchHeading />
      <SkeletonRegion className="mt-5 gap-0">
        <Block className="h-12 w-full [--poster-radius:var(--radius-5)]" />
        <div className="pt-8">
          <Block className="h-2.5 w-32" />
          <div className="mt-3 flex gap-3 overflow-hidden">
            {["a", "b", "c", "d", "e"].map((key) => (
              <span key={key} className="flex w-[124px] shrink-0 flex-col gap-2">
                <PosterBlock className="w-full" />
                <Block className="h-2.5 w-[75%]" />
              </span>
            ))}
          </div>
        </div>
      </SkeletonRegion>
    </main>
  );
}
