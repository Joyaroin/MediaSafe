/**
 * TMDB's CDN URL for an episode's still — its `still_path`, mirrored by issue #246.
 * `app/poster.tsx`'s `posterSrc`, for stills: one CDN size per call site, the smallest
 * bucket that covers the width it actually draws, and a plain URL rather than `next/image`
 * for the reasons `poster.tsx` argues.
 *
 * Its own buckets, because TMDB's still sizes are not its poster sizes: `/t/p/w300` and
 * `w780` are what the CDN publishes for stills, while `w154` and `w342` are poster widths
 * and answer with nothing here.
 *
 * Tonight's featured artwork (`tonight-featured.tsx`) is the one caller; it crops the still
 * to its own area rather than drawing it in a box of its own.
 */
const STILL_BUCKETS = [300, 780] as const;

function bucketFor(width: number): string {
  const fit = STILL_BUCKETS.find((bucket) => bucket >= width);
  return fit === undefined ? "original" : `w${fit}`;
}

export function stillSrc(stillPath: string, width: number): string {
  return `https://image.tmdb.org/t/p/${bucketFor(width)}${stillPath}`;
}
