/**
 * *Mark this episode watched*, drawn — issue #217. A single tick.
 *
 * Rectilinear, filled, `currentColor`, in the same vocabulary as `nav-icons.tsx` — *there
 * is no icon set; the handful that exist are hand-drawn rectilinear SVGs sharing one
 * vocabulary with the press mark.* The tick is a polygon rather than a stroke: one filled
 * shape, not a stroked path, keeps every glyph built from the same two primitives.
 *
 * It carries no title and no label of its own — the button that holds it is what is
 * labelled (`MarkWatchedButton`'s own `aria-label`), so a screen reader is told what the
 * control *does* rather than what the picture is of.
 */
export function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon
        points="9,16.17 4.83,12 3.41,13.41 9,19 21,7 19.59,5.59"
        fill="currentColor"
      />
    </svg>
  );
}
