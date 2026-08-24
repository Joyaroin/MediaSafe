/**
 * An episode's own image — `app/poster.tsx` at TMDB's other ratio, and its sibling in
 * every way that matters (#250).
 *
 * The still became renderable at all in #246, which moved `still_path` across ADR-0001's
 * line into the mirror: it was an *additional image* and so fetched live, and a rail of
 * landscape cards would have made that one catalogue request per card.
 *
 * ── Why this is a second component and not a ratio prop on `Poster` ─────────────────
 *
 * `poster` is a `@utility` in `app/globals.css` carrying `aspect-ratio: 2 / 3` and a
 * `--poster-radius` custom property, and three surfaces set that radius through it. A
 * ratio prop would mean either a second `@utility` reached through the same component —
 * two shapes behind one name — or an inline `aspect-ratio` that only one caller ever
 * passes. The two images share nothing but an `<img>` and a CDN host, and the bucket
 * ladders are genuinely different: TMDB publishes four still widths and six poster ones.
 *
 * Everything `Poster`'s own docblock argues carries over unchanged and is not restated
 * here: a plain `<img>` rather than `next/image`, because ADR-0001 serves borrowed artwork
 * from TMDB's CDN and Vercel's metered optimiser is what `SPEC.md` §3.8's ceiling is about;
 * `alt=""` and `aria-hidden`, because every surface that renders one names the episode
 * beside it as real text; and one CDN size per surface rather than one fixed size
 * everywhere.
 */
const STILL_BUCKETS = [92, 185, 300] as const;

function bucketFor(width: number): string {
  const fit = STILL_BUCKETS.find((bucket) => bucket >= width);
  return fit === undefined ? "original" : `w${fit}`;
}

export function Still({
  stillPath,
  width,
  className,
  aboveFold = false,
}: {
  /** TMDB's `still_path`, or `null` — which is **ordinary rather than exceptional** here:
   *  unaired episodes and most specials have no still (`db/tables.ts`). */
  stillPath: string | null;
  /** The CSS pixel width this call site renders the still at, for CDN sizing only. */
  width: number;
  /** The measure. The ratio below fixes the other side, so nothing is ever cropped to a
   *  shape TMDB did not publish. */
  className?: string;
  /** This instance is on screen without scrolling — the rail rendering it is what knows
   *  (`app/poster.tsx` states the whole argument). */
  aboveFold?: boolean;
}) {
  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden bg-raised ${className ?? ""}`}
    >
      {stillPath === null ? null : (
        // ADR-0001: borrowed artwork is served from TMDB's CDN, and `next/image` would
        // route it through Vercel's metered optimiser. `app/poster.tsx` carries the full
        // argument for the same decision on the poster.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="block h-full w-full object-cover"
          src={`https://image.tmdb.org/t/p/${bucketFor(width)}${stillPath}`}
          alt=""
          aria-hidden="true"
          loading={aboveFold ? "eager" : "lazy"}
          fetchPriority={aboveFold ? "high" : undefined}
          decoding="async"
        />
      )}
      {/*
        No still is not an error and gets no placeholder, which is `Poster`'s settled
        decision held to rather than the handoff's drawn one. Its states column draws a
        dashed frame, a glyph and the words *No poster*; this build decided against exactly
        that for the poster — *a "no image" glyph would be the only apology in a world that
        has none* — and shipping the apology on the still while the poster beside it on the
        same screen goes without would be two answers to one question. The `--raised` ground
        is already a quiet rectangle.
      */}
    </div>
  );
}
