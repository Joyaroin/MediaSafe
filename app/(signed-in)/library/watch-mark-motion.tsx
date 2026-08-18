/**
 * The strike-and-stamp itself — `DESIGN.md`'s Motion section, issue #88's extraction, and
 * the one animation the product uses anywhere a watch lands (issue #90's film recording
 * control is the second and, so far, last row that plays it). `WatchStrike` belongs
 * inside the struck name's own `relative` wrapper; `WatchStamp` belongs in the row's own
 * `relative` container, offset to the row's trailing edge. Both are `position: absolute`
 * (`app/globals.css`'s `watch-strike` / `watch-stamp` utilities), which is what keeps
 * either from taking up flow space — the identical-bounding-rect guarantee
 * `programme-note-episodes.tsx`'s docblock records as measured, not assumed, depends on
 * that staying true on every row this mounts into.
 */
export function WatchStrike({ onSettled }: { readonly onSettled: () => void }) {
  return <span className="watch-strike" aria-hidden onAnimationEnd={onSettled} />;
}

export function WatchStamp() {
  return (
    <span className="watch-stamp code-line" aria-hidden>
      Watched
    </span>
  );
}
