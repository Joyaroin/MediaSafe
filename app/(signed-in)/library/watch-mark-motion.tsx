/**
 * The sweep — issue #139. A wash of the accent across the row's own bounding box
 * (`app/globals.css`'s `watch-sweep`), a full-row `<span>` belonging directly inside the
 * row's own `relative` `<li>` (`programme-note-episodes.tsx`'s `EpisodeLine` / `FilmRow`).
 *
 * `onAnimationEnd` fires the row's own `settle()` call, once — whichever surface showing
 * this episode gets there first (`watch-marks.ts`'s `settle`).
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
