/**
 * *Unwatch*, drawn — issue #315. Two crossed bars, the same "this takes something away"
 * shape `remove-control.tsx`'s own arrow-away glyph would draw if it had one, and the
 * redundant signal this ticket exists to add: `Undo` and `Unwatch` used to differ by one
 * word only, at identical size, weight and colour, twelve pixels apart, and #300's problem
 * statement names exactly that as the danger — a slip destroys every watch of an episode
 * when the reader meant to take back one.
 *
 * Rectilinear, filled, `currentColor`, in the same vocabulary as `checkmark-icon.tsx` and
 * `mark-up-to-icon.tsx` — *there is no icon set; the handful that exist
 * are hand-drawn rectilinear SVGs sharing one vocabulary with the press mark.* A rotated
 * `rect` is still a straight-edged shape, the same primitive `MarkUpToIcon`'s wedge and
 * `CheckmarkIcon`'s tick are built from, so the X drawn here adds no curve — a magnifier
 * would still be the only one in the application.
 *
 * It is shape, not colour, on purpose. This world has one accent and no second, "warning"
 * colour to reach for (`app/globals.css`'s palette is `ground`/`raised`/`hair`/`text`/
 * `dim`/`ink`/`accent` and nothing else), and `errors/recovery-buttons.ts`'s own docblock
 * records the ruling that a further button register — a fourth tier beside
 * ghost and solid — was considered and declined. This glyph is not a tier: it rides inside
 * `GHOST_RECOVERY`, unchanged, the same register `Rewatch` and `Undo` already wear.
 *
 * It carries no title and no label of its own — the button that holds it already carries
 * the word *Unwatch*, so a screen reader is told the same thing twice at most, never
 * instead of once.
 */
export function UnwatchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="10.5" width="20" height="3" fill="currentColor" transform="rotate(45 12 12)" />
      <rect x="2" y="10.5" width="20" height="3" fill="currentColor" transform="rotate(-45 12 12)" />
    </svg>
  );
}
