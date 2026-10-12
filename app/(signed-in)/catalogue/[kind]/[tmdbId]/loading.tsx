import { BackBar } from "@/app/(signed-in)/back-bar";
import { TitleHeroSkeleton } from "@/app/(signed-in)/library/title-hero-skeleton";
import { HERO_POSTER_MEASURE } from "@/app/(signed-in)/library/hero-poster-measure";
import { PosterBlock } from "@/app/skeleton";

/**
 * An unowned title's detail, still reading — a route whose heading is itself the answer.
 *
 * What `error.tsx` renders, less the failure — the back bar and no `<h1>`,
 * because `{detail.name}` is exactly the thing being waited for. No poster either: nothing
 * has been handed to this segment on a cold route render, unlike the desktop pane's
 * `loading` frame, which mounts one from a fact the tile it was pressed from already held.
 */
export default function UnownedTitleLoading() {
  return (
    <main className="arrive-fast relative -mt-3 flex w-full flex-1 flex-col lg:mt-0">
      <BackBar overArtwork />

      {/* The hero's own layout, as on an owned title's page — nothing was carried here, so
          the poster is a block in the hero's own measure rather than a picture. */}
      <TitleHeroSkeleton
        poster={
          <div className="shrink-0 route-pending-hold">
            <div className={HERO_POSTER_MEASURE}>
              <PosterBlock className="w-full" radius="var(--radius-4)" />
            </div>
          </div>
        }
      />
    </main>
  );
}
