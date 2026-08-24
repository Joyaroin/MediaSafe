/**
 * The frame at the top of an episode's page — TMDB's `still_path`, mirrored by issue #246
 * and rendered here for the first time (issue #253).
 *
 * `app/poster.tsx`'s sibling, and deliberately built the same way. Read that file first;
 * everything it argues applies unchanged and is not repeated here:
 *
 *  - **A plain `<img>`, never `next/image`.** ADR-0001 stores no image blobs and serves
 *    borrowed artwork off TMDB's CDN; routing it through Vercel's metered optimiser is
 *    the shape of thing `SPEC.md` §3.8's £5/month ceiling exists to keep out.
 *  - **One CDN size per surface**, picked by `bucketFor` from the width the call site
 *    actually renders, so nothing downloads a frame larger than it draws.
 *  - **`alt=""` and `aria-hidden`**, because the episode is named as real text directly
 *    beneath this. An `alt` here would make a screen reader read every episode twice.
 *
 * ── Its own buckets, because TMDB's still sizes are not its poster sizes ─────────────
 *
 * `/t/p/w300` and `w780` are what the CDN publishes for stills; `w154` and `w342` are
 * poster widths and answer with nothing here. Two ladders, because there are two, and a
 * shared constant would have to be the union of them — which is a size list that is wrong
 * for both.
 *
 * ── `16 / 9`, and the placeholder ────────────────────────────────────────────────────
 *
 * TMDB's stills are frames from the episode, so the ratio is the broadcast one rather than
 * the poster's `2 / 3`. The `still` utility (`app/globals.css`) fixes it, which is the
 * whole of what "renders the placeholder" means for an episode with no artwork
 * (issue #253's criterion, and #245's user story 48 — *so that a missing still does not
 * collapse the row*).
 *
 * That is the same answer `Poster` gives and it is worth being explicit that it is: the
 * frame keeps its measure and shows the `raised` ground, and **no glyph, no wordmark and
 * no "no image" apology goes inside it**. `poster.tsx` refuses one on the grounds that it
 * *would be the only apology in a world that has none*, and nothing about an episode makes
 * that less true. What #245 asked for is that the space is held, not that it is captioned,
 * and holding it is what an `aspect-ratio` does.
 */
const STILL_BUCKETS = [300, 780] as const;

function bucketFor(width: number): string {
  const fit = STILL_BUCKETS.find((bucket) => bucket >= width);
  return fit === undefined ? "original" : `w${fit}`;
}

export function EpisodeStill({
  stillPath,
  width,
  className,
}: {
  /** TMDB's `still_path`, or `null` when the catalogue has no frame for this episode. */
  stillPath: string | null;
  /** The CSS pixel width this call site renders the still at, for CDN sizing only. */
  width: number;
  /** The measure. The `still` utility fixes the ratio, so a call site sets one side. */
  className: string;
}) {
  return (
    <div className={`still ${className}`}>
      {stillPath === null ? null : (
        /**
         * ADR-0001: borrowed artwork is served from TMDB's CDN and no image blobs are
         * stored, so `next/image` would put Vercel's metered optimiser between the two —
         * the spend `SPEC.md` §3.8's £5/month ceiling exists to keep out. `app/poster.tsx`
         * makes the same call for the same reason and carries the longer argument.
         */
        // eslint-disable-next-line @next/next/no-img-element -- See the note above.
        <img
          className="block h-full w-full object-cover"
          src={`https://image.tmdb.org/t/p/${bucketFor(width)}${stillPath}`}
          alt=""
          aria-hidden="true"
          // The one frame above the fold on the surface that renders it — this is the
          // first thing on the page, unlike a poster in a grid of 462.
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      )}
    </div>
  );
}
