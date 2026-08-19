/**
 * The plate — `DESIGN.md`'s signature component, and the device that makes a wall of
 * borrowed posters look like one printed sheet.
 *
 * TMDB artwork arrives in inconsistent ratios and clashing colour. The plate forces all of
 * it into one measure: a neutral ground, artwork contributing only its luminosity, and a
 * half-tone screen over both. The ground was ultramarine (`--color-spot`) until #134
 * retired that token; it is `--color-raised` now, and the duotone treatment itself is
 * retired in #135. A dark poster renders as a near-black plate and a bright one as a pale
 * one — the value range of the original survives, only the colour does not.
 *
 * Three layers, and only the first is expressible as a class: the `plate` utility is the
 * container, and `.plate > .art` and `.plate::after` are plain CSS in `app/globals.css`
 * because a Tailwind `@utility` cannot reach a child or a pseudo-element.
 *
 * ── The image is a plain `<img>`, deliberately ───────────────────────────────────────
 *
 * ADR-0001: *posters are referenced by `poster_path` and served from TMDB's CDN. No image
 * blobs are stored.* `next/image` would put Vercel's image optimiser between the two, and
 * that is a metered resource on Hobby — `SPEC.md` §3.8's £5/month ceiling with £0 spent is
 * a constraint, and 472 titles of borrowed artwork is exactly the shape of thing that
 * quietly starts costing. TMDB's CDN already serves the sizes; `w154` is the one this
 * measure needs.
 *
 * The plate also wants `object-fit: cover` under two blend modes on the element itself,
 * which is a wrapper `next/image` would put a div in the middle of.
 */

/** TMDB's poster CDN, at the width the plate renders. */
const POSTER_BASE = "https://image.tmdb.org/t/p/w154";

export function Plate({
  posterPath,
  className,
}: {
  /** TMDB's `poster_path`, or `null` when TMDB has no artwork for this title. */
  posterPath: string | null;
  /** The measure. Every surface fixes its own width and height (`DESIGN.md`). */
  className: string;
}) {
  return (
    <div className={`plate ${className}`}>
      {posterPath === null ? null : (
        /**
         * `alt=""` and `aria-hidden`, because the plate is never the only place the title
         * is named — every surface that renders one renders the name beside it as real
         * text. An `alt` here would make a screen reader read every title twice.
         *
         * eslint-disable-next-line @next/next/no-img-element -- See the note above: the
         * artwork is served from TMDB's CDN by ADR-0001, and `next/image` would route it
         * through Vercel's metered optimiser and wrap the element the blend modes are on.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="art"
          src={`${POSTER_BASE}${posterPath}`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      )}
      {/*
        No artwork is not an error and gets no placeholder: the plate's own ground and
        half-tone screen are already a printed rectangle, and a "no image" glyph would be
        the only apology in a world that has none.
      */}
    </div>
  );
}
