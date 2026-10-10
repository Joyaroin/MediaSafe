import { Block, SkeletonRegion } from "@/app/skeleton";

/**
 * The title page while it reads — laid out **exactly** as `title-hero.tsx` lays out the
 * hero, so the poster the morph just landed is already where the hero will put it, and the
 * text arrives into the space its blocks held (UI overhaul).
 *
 * It used to be a poster beside three bars under the back bar, top-aligned, while the hero
 * sits lower over its backdrop and bottom-aligned — so the poster moved a second time when
 * the read resolved.
 */
export function TitleHeroSkeleton({ poster }: { readonly poster: React.ReactNode }) {
  return (
    <>
      <div className="relative flex items-end gap-5 px-gutter pt-20 lg:gap-8 lg:px-10 lg:pt-36">
        {poster}
        {/* The one live region — *Reading* is said once for the page. */}
        <SkeletonRegion className="min-w-0 flex-1 gap-2.5 pb-1">
          <Block className="h-6 w-20 [--poster-radius:var(--radius-full)]" />
          <Block className="h-7 w-[80%] lg:h-9" />
          <Block className="h-3 w-[45%]" />
        </SkeletonRegion>
      </div>

      <div
        aria-hidden="true"
        className="route-pending-hold mt-5 flex flex-col gap-5 px-gutter lg:px-10 lg:pl-[272px]"
      >
        <div className="flex gap-3">
          <Block className="h-11 w-44 [--poster-radius:var(--radius-full)]" />
          <Block className="h-11 w-11 [--poster-radius:var(--radius-full)]" />
        </div>
        <div className="flex max-w-[62ch] flex-col gap-2">
          <Block className="h-3 w-full" />
          <Block className="h-3 w-[92%]" />
          <Block className="h-3 w-[64%]" />
        </div>
      </div>
    </>
  );
}
