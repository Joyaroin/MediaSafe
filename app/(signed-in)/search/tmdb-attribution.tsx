/**
 * TMDB's required notice. **An attribution obligation, not decoration**
 * ([#3](https://github.com/Joyaroin/MediaSafe/issues/3)), and
 * `docs/design/v1-surfaces.md` §7 names its two homes: title detail and search — *"where
 * borrowed data is on screen"*. This is the first of the two to exist.
 *
 * Pinned to the foot of the surface rather than left at the end of the results, as the
 * prototype has it (`docs/design/prototypes/repertory-bill.html:489`): a notice that only
 * appears if you scroll far enough is a notice that is absent for anyone whose search
 * matched three things.
 *
 * `text-fine` is the ramp step `DESIGN.md`'s type table reserves for exactly this — *"one
 * use: the TMDB attribution line. Legal and attribution copy only."*
 *
 * The two hexes in the mark are TMDB's own brand colours, and `DESIGN.md`'s *raw hex
 * outside the theme* section already accounts for them: *"a third party's colours, which
 * are not ours to token."*
 */
export function TmdbAttribution() {
  return (
    <div className="mt-12 flex shrink-0 items-center gap-3 border-t border-rule pt-3">
      <svg
        viewBox="0 0 34 12"
        className="h-3 w-auto shrink-0"
        role="img"
        aria-label="TMDB"
      >
        <rect width="34" height="12" fill="#0d253f" />
        <rect x="3" y="4.5" width="28" height="3" fill="#01b4e4" />
      </svg>
      <p className="text-fine leading-snug text-stock-dim">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
