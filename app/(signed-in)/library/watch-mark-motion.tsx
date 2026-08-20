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

/**
 * The **quiet** recording control — issue #196's *watched up to here*, and the only
 * control in the application whose whole text is its accessible label.
 *
 * ── Why it is not `RECORDING_CONTROL`, and not `GHOST_RECOVERY` either ──────────────
 *
 * It records watches, so `app/globals.css`'s *Live* role would put it in the accent. It is
 * dim at rest anyway, for the reason issue #89 gave *Rewatch* and *Unwatch* before #195
 * moved them: **nothing on this row may compete with the daily gesture.** *Strike it* is
 * what a reader presses every evening; this is pressed once, when a show arrives, and then
 * never again on that title. A hairline border and dim ink says *pressable* without saying
 * *press me*. It takes the accent on hover, because by then the reader has asked what it
 * is and the honest answer is that it records watches.
 *
 * ── It is named here because §10 says so, and because it is already the second copy ──
 *
 * `DESIGN.md` §10: *where a treatment must not drift, it is a named class string in the
 * module that owns it.* This one was written inline at its call site in #196 and the
 * two-axis review caught it — which matters more than it would have, because a hairline
 * neutral variant **already existed** inline in `add-to-list-control.tsx`. Two unnamed
 * copies of one register is exactly the drift `errors/recovery-buttons.ts`'s own docblock
 * exists to prevent.
 *
 * The two are not merged here, and that is a scope statement rather than a judgement:
 * `add-to-list-control.tsx`'s is `code-line px-4 py-2 text-text` on a full-size control
 * and this is an icon at `p-1`, so unifying them is a decision about what a neutral tier
 * *is* — a question `DESIGN.md` §10 explicitly records as considered and declined during
 * #195. Naming this one is what stops a third copy; settling the register is #194's.
 */
export const QUIET_RECORDING_CONTROL =
  "shrink-0 border border-hair p-1 text-dim transition-colors duration-150 hover:border-accent hover:text-accent";
