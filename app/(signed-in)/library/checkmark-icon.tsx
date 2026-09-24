/**
 * *Mark this episode watched*, drawn — issue #217. A single tick, not the wedge-onto-a-rule
 * `MarkUpToIcon` draws two doors down: the two controls now differ by shape as well as by
 * position, which is what lets a reader tell *mark this one* from *mark everything up to
 * here* without reading either label.
 *
 * Rectilinear, filled, `currentColor`, in the same vocabulary as `nav-icons.tsx` and
 * `mark-up-to-icon.tsx` — *there is no icon set; the handful that exist
 * are hand-drawn rectilinear SVGs sharing one vocabulary with the press mark.* The tick is
 * a hexagon rather than a stroke for the same reason `MarkUpToIcon`'s wedge is a polygon
 * and not two rotated `rect`s glued together: one filled shape, not a stroked path, keeps
 * every glyph in this file built from the same two primitives.
 *
 * It carries no title and no label of its own — the button that holds it is what is
 * labelled (`MarkWatchedButton`'s own `aria-label`), so a screen reader is told what the
 * control *does* rather than what the picture is of, the same rule `mark-up-to.ts`'s
 * `markUpToLabel` states for its own glyph.
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
