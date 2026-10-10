/**
 * The title hero's poster measure, on the element that is the flex item — shared by the
 * hero (`title-hero.tsx`) and its pending frame (`titles/[entryId]/pending-poster.tsx`).
 *
 * It was two literals with a comment saying they must move together, and they had not:
 * the frame drew the poster at `w-[34%] max-w-[140px]` against the hero's `108px`, so a
 * poster that morphed in from a list jumped a second time when the read resolved (UI
 * overhaul). One constant is what keeps the two the same size.
 */
export const HERO_POSTER_MEASURE = "w-[108px] shrink-0 lg:w-[200px]";
