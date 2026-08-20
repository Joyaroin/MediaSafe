/**
 * *Watched up to here*, drawn — issue #196. A solid wedge coming down onto a rule: the
 * rows above, brought down to this line.
 *
 * Rectilinear, filled, `currentColor`, in the same vocabulary as `nav-icons.tsx` and
 * `[listId]/drag-handle-icon.tsx` — `DESIGN.md` §10: *there is no icon set; the handful
 * that exist are hand-drawn rectilinear SVGs sharing one vocabulary with the press mark.*
 * The wedge is a polygon rather than a fourth stacked bar because three identical bars
 * read as *a list* and say nothing about direction, and this control's whole meaning is
 * the direction: everything **before** this row, not the row itself.
 *
 * It is a triangle, which `nav-icons.tsx`'s `UpNextIcon` and the sort caret already make
 * the one non-rectangular shape in the build; a curve would be the only one in the
 * application and this is not the control that earns the exception.
 *
 * It carries no title and no label of its own. The button that holds it is what is
 * labelled — `mark-through.ts`'s `markThroughLabel` — so a screen reader is told what the
 * control *does* rather than what the picture is of.
 */
export function MarkThroughIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon points="4,2 20,2 12,13" fill="currentColor" />
      <rect x="2" y="18" width="20" height="3" fill="currentColor" />
    </svg>
  );
}
