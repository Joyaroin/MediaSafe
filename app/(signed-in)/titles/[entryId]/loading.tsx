import { BackBar } from "@/app/(signed-in)/back-bar";
import { TitleHeroSkeleton } from "@/app/(signed-in)/library/title-hero-skeleton";
import { PendingTitlePoster } from "./pending-poster";

/**
 * A title's own page, pending — the hero's own layout (`title-hero-skeleton.tsx`), with the
 * carried poster already in its final place.
 *
 * The poster is **outside** the held region, deliberately: it is the morph's landing and
 * must be visible at once, while the blocks beside it wait out `--dur-pending-hold` like
 * every route's (#301). A fast read never shows them.
 */
export default function TitleDetailLoading() {
  return (
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <BackBar />
      <TitleHeroSkeleton poster={<PendingTitlePoster />} />
    </main>
  );
}
