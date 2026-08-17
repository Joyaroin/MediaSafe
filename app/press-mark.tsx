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
