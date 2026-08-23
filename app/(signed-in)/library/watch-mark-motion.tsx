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
 * The recording control's hit box — issue #217, which took *Strike it* from a `code-line`
 * text pill to a checkmark and, with the copy gone, could finally give the daily gesture
 * the target size the row itself has always had. `catalogue-result.tsx`'s own words are
 * why this is the `<button>` itself and not a wrapper around a smaller one: *"a button's
 * hit area is its own border box and nothing its parent adds reaches it."*
 *
 * `h-11 w-11` is `44px` square, `app/masthead.tsx`'s and `catalogue-result.tsx`'s own
 * number for *every tap target ≥44px*. `-my-2` is what keeps the row from growing to fit
 * it: `EPISODE_ROW`'s own `py-2` is `8px` a side, and a negative margin of the same size
 * pulls the button's margin box back to `44 − 16 = 28px` — the row's own budget, the exact
 * ceiling `min-h-11` was measured to hold (`episode-line.ts`, `DESIGN.md` §6) and the one
 * `RECORDING_CONTROL`'s old `26.2px` text pill sat comfortably under. The button's border
 * box still paints the full `44px`; the margin only stops that box from pushing the row
 * taller, the same trick `masthead.tsx`'s Settings link plays sideways instead of down.
 *
 * `group`, so `RECORDING_GLYPH` below can invert on a hover over the *hit box*, not over
 * the smaller chip drawn inside it — the whole reason the two are separate elements.
 */
export const RECORDING_HIT_BOX = "group -my-2 flex h-11 w-11 shrink-0 items-center justify-center";

/**
 * The recording control's visible chip — the same ghost treatment (`DESIGN.md`, Buttons:
 * `1px` `accent` border, `accent` text on `ground`, inverting to solid on press) the old
 * `RECORDING_CONTROL` drew around its own text, now around `CheckmarkIcon` instead. Sized
 * to the glyph (`p-1` around `h-4 w-4`) rather than to a label, because there is no longer
 * a label to hold — `26px` square, unchanged from the `26.2px` box `MarkUpToIcon`'s own
 * docblock already paired it with.
 *
 * `group-hover:`, not `hover:`: the element a pointer sits over is `RECORDING_HIT_BOX`,
 * `9px` wider than this on every side, so the invert has to answer to the group rather
 * than to itself. `MarkWatchedButton` composes both of these with
 * `errors/recovery-buttons.ts`'s `IN_FLIGHT`, on the hit box — a `filter: brightness()`
 * dims everything it paints, chip included, so `IN_FLIGHT` needs no second copy here.
 */
export const RECORDING_GLYPH =
  "flex items-center justify-center border border-accent p-1 text-accent transition-colors duration-150 group-hover:bg-accent group-hover:text-accent-ink";

/**
 * The **quiet** recording control — issue #196's *watched up to here*, and the only
 * control in the application whose whole text is its accessible label.
 *
 * ── Why it is not `RECORDING_HIT_BOX`/`RECORDING_GLYPH`, and not `GHOST_RECOVERY` either ──
 *
 * It records watches, so `app/globals.css`'s *Live* role would put it in the accent. It is
 * dim at rest anyway, for the reason issue #89 gave *Rewatch* and *Unwatch* before #195
 * moved them: **nothing on this row may compete with the daily gesture.** The checkmark is
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
