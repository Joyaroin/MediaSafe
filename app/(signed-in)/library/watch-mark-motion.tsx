/**
 * The strike-and-stamp — `DESIGN.md`'s Motion section, issue #88's extraction, and the
 * animation `up-next-grid.tsx`'s TONIGHT card and the phone home's dominant card
 * (`up-next-dominant-card.tsx`, until #138 retires it) still play when a watch lands.
 * `WatchStrike` belongs inside the struck name's own `relative` wrapper; `WatchStamp`
 * belongs in the row's own `relative` container, offset to the row's trailing edge. Both
 * are `position: absolute` (`app/globals.css`'s `watch-strike` / `watch-stamp`
 * utilities), which is what keeps either from taking up flow space.
 *
 * Issue #139 retires this pair on title detail — `WatchSweep` below is what plays there
 * now. It is not a replacement for these two: the surfaces above have not moved to the
 * new world, and neither had a ticket asking them to.
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

/**
 * The struck name's static, post-animation appearance — `up-next-dominant-card.tsx`'s own
 * class string, applied once `watched && phase === "settled"`. Title detail no longer
 * reads this: `WATCHED_NAME` below is its own settled treatment, and the two are allowed
 * to differ because the two surfaces are no longer drawing the same motion.
 */
export const STRUCK_NAME = "text-dim line-through decoration-2 decoration-accent";

/**
 * The sweep — issue #139. One motion, not two: a wash of the accent across the row's own
 * bounding box (`app/globals.css`'s `watch-sweep`), which is a full-row `<span>` rather
 * than `WatchStrike`'s tight wrapper around the name alone. It belongs directly inside the
 * row's own `relative` `<li>` (`programme-note-episodes.tsx`'s `EpisodeLine` / `FilmRow`),
 * not inside the name's wrapper — it sweeps the row, not the name, and there is no second
 * element offset to a trailing edge the way `WatchStamp` needed one.
 *
 * `onAnimationEnd` is the same wiring `WatchStrike` used: the row's own `settle()` call,
 * fired once — whichever surface showing this episode gets there first
 * (`watch-marks.ts`'s `settle`).
 */
export function WatchSweep({ onSettled }: { readonly onSettled: () => void }) {
  return <span className="watch-sweep" aria-hidden onAnimationEnd={onSettled} />;
}

/**
 * The watched episode name's settled appearance on title detail — issue #139. The sweep
 * fades to nothing over its own animation (`watch-sweep-in`'s `100%` keyframe), so nothing
 * accent-coloured survives once it settles; what says *watched* from here is the name
 * alone, dimmed — no strike, no decoration. `text-dim` is the whole of it.
 */
export const WATCHED_NAME = "text-dim";

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
