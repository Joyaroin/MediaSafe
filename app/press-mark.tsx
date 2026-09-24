/**
 * The mark and the name together, at the one size the type ramp gives the wordmark
 * (`text-bill-xs` — the type table: *the wordmark, the four compact phone deck
 * titles, and the phone hero's episode name*).
 *
 * Two surfaces carry it, and only one of them has a masthead: the signed-in shell, and the
 * sign-in route, which has none because the masthead's only control is a Settings entrance
 * leading somewhere a signed-out reader cannot go (reserve no space, no
 * placeholder destinations). Written once so those two cannot drift into two wordmarks.
 *
 * The mark's size is the caller's, because the masthead sets it smaller than the sign-in
 * page does — and since the linen redesign the name's register is the caller's too, for
 * the same reason and no more: turn 9 sets the phone masthead's wordmark in the label
 * register, and it did not redraw the sign-in surface, which keeps the bill's own cut.
 * Defaulted rather than required so that the caller turn 9 never touched did not have to
 * be edited to stay exactly as it was.
 */
export function Wordmark({
  markClassName,
  nameClassName = "bill-title text-bill-xs leading-none",
}: {
  markClassName: string;
  /** The name's type register. Defaults to the bill's — `masthead.tsx` passes turn 9's
   *  label register instead. */
  nameClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PressMark className={`${markClassName} shrink-0`} />
      <span className={nameClassName}>MediaSafe</span>
    </div>
  );
}

/**
 * The press mark: a hairline square with a struck accent bar.
 *
 * The same drawing as `app/icon.svg`, and deliberately a second copy of it rather than a
 * shared source. The favicon is a standalone document a browser fetches on its own, with
 * its own opaque ground and no stylesheet to inherit from, so it fixes the accent
 * to the dark palette's value; this one is inline SVG in a page, takes its stroke from
 * `currentColor` and its bar from `var(--color-accent)`, and has no ground at all — so it
 * follows the system setting the favicon cannot. One file cannot be both, and the comment
 * in `app/icon.svg` already names itself as one of the two places the accent lives.
 *
 * `aria-hidden` because the wordmark beside it says *MediaSafe* in text. A mark that
 * announced itself as well would have every screen reader read the name twice.
 */
export function PressMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* `var(--color-accent)`, not a Tailwind class: an SVG `fill` attribute cannot read
          a utility class, but it can read a custom property, which is what lets this
          bar — unlike `app/icon.svg`'s literal — follow the system's colour scheme. */}
      <rect x="5" y="10.5" width="14" height="3" fill="var(--color-accent)" />
    </svg>
  );
}
