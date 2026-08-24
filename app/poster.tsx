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

/**
 * TMDB's own CDN URL for a poster at the smallest bucket that covers `width` — exported so
 * a caller that needs the URL rather than this component's `<div className="poster">` box
 * can still go through `bucketFor` rather than restating the size ladder. `you-list-card.tsx`
 * is the first: a list card's four-poster collage crops each cover to a square cell, which
 * `Poster`'s own `2/3`-ratio box cannot draw.
 */
export function posterSrc(posterPath: string, width: number): string {
  return `https://image.tmdb.org/t/p/${bucketFor(width)}${posterPath}`;
}

export function Poster({
  posterPath,
  name,
  width,
  className,
  aboveFold = false,
}: {
  /** TMDB's `poster_path`, or `null` when TMDB has no artwork for this title. */
  posterPath: string | null;
  /**
   * The title's name, used **only** when there is no artwork — see the note below the
   * `img` for what it draws and why that is not a placeholder glyph.
   *
   * Optional, so a call site that has no name to give renders the quiet rectangle this
   * component always drew. Every surface that shows a poster also shows the name as real
   * text, so passing it costs nothing and is the right default.
   */
  name?: string;
  /** The CSS pixel width this call site renders the poster at, for CDN sizing only. */
  width: number;
  /** The measure. Every surface fixes its own width or height — never both, so the
   *  `poster` utility's `aspect-ratio: 2 / 3` is what determines the other side, rather
   *  than a crop. */
  className: string;
  /**
   * This instance is on screen without scrolling — the caller's own first grid row, rail
   * tile, or the pane/page's one hero poster. `Poster` is a shared module with call sites
   * across every surface in the app and cannot tell an above-the-fold instance from a
   * below-the-fold one by itself; the surface rendering it knows. Defaults to `false` so
   * an existing call site that never passes this keeps downloading lazily, exactly as
   * before — only a surface that opts a poster in starts fetching it eagerly.
   */
  aboveFold?: boolean;
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
          loading={aboveFold ? "eager" : "lazy"}
          fetchPriority={aboveFold ? "high" : undefined}
          decoding="async"
        />
      )}
      {/*
        ── No artwork, and what stands in for it ─────────────────────────────────────

        This used to read: *no artwork is not an error and gets no placeholder — a "no
        image" glyph would be the only apology in a world that has none.* The second half
        of that still binds and always will. There is no broken-image mark here, no camera
        icon and no grey "poster unavailable" panel.

        What changed is the first half. A bare rectangle is fine in a grid where the name
        is written beside it, and it is not fine in a rail of titles you have never heard
        of, where the poster is doing the identifying. So the fallback is the **name**,
        set in the title's own initials — not a picture of a missing picture, but the one
        fact about the title this component already has, drawn large enough to tell two
        cards apart.

        `aria-hidden`, like the `img` above and for the identical reason: the name is real
        text on every surface that renders a poster, and reading it twice helps nobody.
      */}
      {posterPath === null && name ? (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center px-2 text-center text-dim"
          // Scaled off the rendered width rather than a type step: this stands in for an
          // image, so it should fill its box the way the image would, at any of the five
          // sizes the application draws a poster at.
          style={{ fontSize: Math.max(11, Math.round(width * 0.28)) }}
        >
          {initialsOf(name)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A title's initials, for the poster that has no artwork.
 *
 * Up to three, from the first letters of its words — *The Great Pottery Throw Down* is
 * `TGP` rather than `TGPTD`, because a fourth letter starts to be unreadable in the
 * smallest box this is drawn in and stops being a mark you recognise at a glance.
 *
 * Articles are **not** dropped. *The Bear* is `TB`, not `B`: this is a visual key, not a
 * sort key, and `db/access.ts` is the only place that has an opinion about how a title
 * alphabetises. A title of one word gives one letter, which is correct — `I` for *I,
 * Claudius* is what the eye has to go on and inventing a second letter from the middle of
 * a word would be worse.
 *
 * Non-alphanumeric leading characters are skipped, so *…And the Bag's in the River* keys
 * off `A`. A name with nothing alphanumeric in it at all gives an empty string, and the
 * caller then draws the quiet rectangle it always drew.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, "").charAt(0))
    .filter((letter) => letter.length > 0)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}
