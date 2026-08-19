/**
 * The poster — what replaces `app/plate.tsx` (#135). 462 pieces of real artwork, shown as
 * themselves: full colour, at TMDB's own `2/3` ratio, uncropped. No grayscale, no ground
 * ink, no half-tone screen — the plate forced every borrowed poster into one measure; this
 * renders the poster it actually is.
 *
 * A poster is one layer, not three. The plate needed a ground, a filtered `<img>` and a
 * pseudo-element screen — three things a `@utility` couldn't bundle, hence the plain-CSS
 * block beside it in `app/globals.css`. Nothing here needs a child selector or a
 * pseudo-element, so `poster` is the one `@utility` this component reads, and the `<img>`
 * below carries its own sizing as ordinary classes rather than a second stylesheet block.
 *
 * ── The image is a plain `<img>`, deliberately ───────────────────────────────────────
 *
 * ADR-0001: *posters are referenced by `poster_path` and served from TMDB's CDN. No image
 * blobs are stored.* `next/image` would put Vercel's metered image optimiser between the
 * two, and `SPEC.md` §3.8's £5/month ceiling with £0 spent is a constraint 462 titles of
 * borrowed artwork is exactly the shape of thing that quietly starts costing.
 *
 * ── One CDN size per surface, not one fixed size everywhere ─────────────────────────
 *
 * The plate asked TMDB for one small size (`w154`) because it drew one small fixed
 * measure. A wall of real artwork at real ratios does not have one measure: `width` is the
 * CSS pixel width this call site actually renders the poster at, and `bucketFor` below
 * picks the smallest TMDB size that covers it without upscaling past the source.
 */
const POSTER_BUCKETS = [92, 154, 185, 342, 500, 780] as const;

function bucketFor(width: number): string {
  const fit = POSTER_BUCKETS.find((bucket) => bucket >= width);
  return fit === undefined ? "original" : `w${fit}`;
}

export function Poster({
  posterPath,
  width,
  className,
}: {
  /** TMDB's `poster_path`, or `null` when TMDB has no artwork for this title. */
  posterPath: string | null;
  /** The CSS pixel width this call site renders the poster at, for CDN sizing only. */
  width: number;
  /** The measure. Every surface fixes its own width or height — never both, so the
   *  `poster` utility's `aspect-ratio: 2 / 3` is what determines the other side, rather
   *  than a crop. */
  className: string;
}) {
  return (
    <div className={`poster ${className}`}>
      {posterPath === null ? null : (
        /**
         * `alt=""` and `aria-hidden`, because the poster is never the only place the
         * title is named — every surface that renders one renders the name beside it as
         * real text. An `alt` here would make a screen reader read every title twice.
         *
         * eslint-disable-next-line @next/next/no-img-element -- See the note above: the
         * artwork is served from TMDB's CDN by ADR-0001, and `next/image` would route it
         * through Vercel's metered optimiser.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="block h-full w-full object-cover"
          src={`https://image.tmdb.org/t/p/${bucketFor(width)}${posterPath}`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      )}
      {/*
        No artwork is not an error and gets no placeholder: `poster`'s own ground colour
        is already a quiet rectangle, and a "no image" glyph would be the only apology in
        a world that has none.
      */}
    </div>
  );
}
