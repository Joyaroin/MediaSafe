/**
 * *Watched*, drawn — issue #220. A single thick check.
 *
 * Filled, `currentColor`, `24 × 24`, in the same vocabulary as `nav-icons.tsx`,
 * `mark-up-to-icon.tsx` and `[listId]/drag-handle-icon.tsx` — `DESIGN.md` §10: *there is
 * no icon set; the handful that exist are hand-drawn rectilinear SVGs sharing one
 * vocabulary with the press mark.* It is a polygon rather than a stroked path so the
 * arms keep one weight at every size, which is how every other glyph in this build is
 * drawn.
 *
 * ── It lives beside `MarkUpToIcon` rather than beside its first caller ──────────────
 *
 * Its first caller is the Up next tile (`up-next/ongoing-tile.tsx`), which is not in this
 * directory. It is here anyway, because this is where the recording controls' drawings
 * live and because the *second* caller is already scheduled: #215 turns the episode row's
 * *Strike it* into this same check, and the two glyphs sitting one file apart is what
 * stops that ticket redrawing it.
 *
 * It carries no title and no label of its own. The button holding it is what is labelled,
 * with the episode it marks — a wall of identical checks has nothing else to tell one
 * from another.
 */
export function MarkWatchedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon
        points="3.5,11 8.5,16 20.5,4 23,6.5 8.5,21 1,13.5"
        fill="currentColor"
      />
    </svg>
  );
}
