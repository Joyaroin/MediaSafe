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
/**
 * The struck name's static, post-animation appearance — the same class string
 * `programme-note-episodes.tsx`'s `EpisodeLine` and `FilmRow` both apply once `watched &&
 * phase === "settled"`, named once now that `up-next-dominant-card.tsx` is a third caller.
 */
export const STRUCK_NAME = "text-dim line-through decoration-2 decoration-accent";

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

/**
 * The recording control's own treatment (`DESIGN.md`, Buttons: ghost, `1px` `accent`
 * border, `accent` text on `ground`, inverting to solid on hover) — one definition, so the
 * class string does not drift the way `errors/recovery-buttons.ts`'s own docblock warns
 * against. `MarkWatchedButton` (`programme-note-episodes.tsx`, issue #88) composes this
 * with `errors/recovery-buttons.ts`'s `IN_FLIGHT`. The desktop Up next row's own *Strike
 * it* button (`up-next-grid.tsx`, issue #100) was a second caller until issue #136 deleted
 * that row; still exported as its own named constant rather than inlined into its one
 * remaining caller, since a second caller returning is cheaper than every class string in
 * the build re-litigating what a recording control looks like from scratch.
 */
export const RECORDING_CONTROL =
  "code-line shrink-0 border border-accent px-2.5 py-1 text-accent transition-colors duration-150 hover:bg-accent hover:text-accent-ink";
