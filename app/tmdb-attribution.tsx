/**
 * TMDB's required notice. **An attribution obligation, not decoration**
 * ([#3](https://github.com/Joyaroin/MediaSafe/issues/3)), and
 * it has two homes: title detail and search — *"where
 * borrowed data is on screen"*. Search was the first of the two to exist; issue #58 is
 * the second, which is why this moved out of `app/(signed-in)/search/` to sit beside
 * `app/poster.tsx` — the other borrowed-artwork device both surfaces share.
 *
 * `className` carries the wrapper's spacing rather than this component fixing it, because
 * the two homes are not laid out alike: search leaves it at the end of a flowing page
 * (`mt-12 … pt-3`), and title detail pins it to the foot of a fixed pane, outside the
 * scroll, on its own ground (`bg-ground px-6 py-3`, no `mt-12`). One notice, two frames — the
 * same reason `Poster` takes its measure from the caller rather than fixing one itself.
 *
 * Pinned to the foot of whichever surface it is on, rather than left at the end of the
 * results, as the prototype had it: a notice that only appears if you
 * scroll far enough is a notice that is absent for anyone whose search matched three
 * things, or whose season has three episodes.
 *
 * `text-fine` is the ramp step the type table reserves for exactly this — *"one
 * use: the TMDB attribution line. Legal and attribution copy only."*
 *
 * The two hexes in the mark are TMDB's own brand colours, and the *raw hex
 * outside the theme* rule already accounts for them: *"a third party's colours, which
 * are not ours to token."*
 */
export function TmdbAttribution({ className = "" }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center gap-3 border-t border-hair ${className}`}>
      <svg
        viewBox="0 0 34 12"
        className="h-3 w-auto shrink-0"
        role="img"
        aria-label="TMDB"
      >
        <rect width="34" height="12" fill="#0d253f" />
        <rect x="3" y="4.5" width="28" height="3" fill="#01b4e4" />
      </svg>
      <p className="text-fine leading-snug text-dim">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
