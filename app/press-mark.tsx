/**
 * The mark and the name together, at the one size the type ramp gives the wordmark
 * (`text-bill-xs` — `DESIGN.md`'s type table: *the wordmark, the four compact phone deck
 * titles, and the phone hero's episode name*).
 *
 * Two surfaces carry it, and only one of them has a masthead: the signed-in shell, and the
 * sign-in route, which has none because the masthead's only control is a Settings entrance
 * leading somewhere a signed-out reader cannot go (`SPEC.md` §9 — reserve no space, no
 * placeholder destinations). Written once so those two cannot drift into two wordmarks.
 *
 * The mark's size is the caller's, because the masthead sets it smaller than the sign-in
 * page does — everything else about the pairing is fixed here.
 */
export function Wordmark({ markClassName }: { markClassName: string }) {
  return (
    <div className="flex items-center gap-3">
      <PressMark className={`${markClassName} shrink-0`} />
      <span className="bill-title text-bill-xs leading-none">MediaSafe</span>
    </div>
  );
}

/**
 * The press mark: a hairline square with a struck vermilion bar, from `DESIGN.md`.
 *
 * The same drawing as `app/icon.svg`, and deliberately a second copy of it rather than a
 * shared source. The favicon is a standalone document a browser fetches on its own, with
 * its own opaque `ink` ground and no stylesheet to inherit from; this one is inline SVG
 * in a page, takes its stroke from `currentColor`, and has no ground at all. One file
 * cannot be both, and the comment in `app/icon.svg` already names itself as one of the
 * two places the vermilion lives.
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
      {/* The one place besides `app/icon.svg` where the vermilion is a literal: an SVG
          `fill` cannot read a Tailwind token. */}
      <rect x="5" y="10.5" width="14" height="3" fill="#E85A38" />
    </svg>
  );
}
