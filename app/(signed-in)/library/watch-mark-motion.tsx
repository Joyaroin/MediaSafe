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

/**
 * `QUIET_RECORDING_CONTROL` at a measure that can hold words — issue #222's *Add —
 * watched*.
 *
 * **This is the same register, not a second one.** Identical hairline border, identical
 * dim ink, identical accent on hover; `code-line px-2.5 py-1` where the one above takes
 * `p-1`, and neither the measure nor the type register is invented — both are
 * `RECORDING_CONTROL`'s, character for character. `errors/recovery-buttons.ts`'s
 * `GHOST_RECOVERY_COMPACT` is the precedent and it states the rule this follows: a second
 * **size** of one register is not the third **tier** `DESIGN.md` §10 records as considered
 * and declined. The question of what a neutral tier *is* stays #194's, exactly as the
 * docblock above leaves it.
 *
 * ── Why the watched add wears the quiet register and not the accent ──────────────────
 *
 * The reasoning above transfers whole, with one word changed. It records watches, so
 * `app/globals.css`'s *Live* role would put it in the accent; it is dim at rest anyway,
 * because **nothing beside the plain add may compete with it**. Adding is what a reader
 * came to the screen to do and is the obvious default; this is pressed once, for a title
 * they finished years ago, and then never again on it. A hairline border and dim ink says
 * *pressable* without saying *press me*, and it takes the accent on hover because by then
 * the reader has asked what it is and the honest answer is that it records watches.
 *
 * That is also what keeps `DESIGN.md` §3's *at most one solid-accent action per surface*
 * true on the search screen, where the plain add is already that one.
 *
 * ── Its callers are not in this directory, and that is the trade ─────────────────────
 *
 * `app/(signed-in)/search/catalogue-result.tsx` and the unowned title page's
 * `add-to-library-control.tsx`, neither of which is about a watch mark. Naming it here
 * anyway is the lesser of the two costs: this module is where the register is defined and
 * argued, and a copy of the string at either call site is the drift the constant above
 * was extracted to stop — the same drift `errors/recovery-buttons.ts`'s own docblock
 * exists to prevent. If a third register-owning module is ever pulled out of this file,
 * both constants move together.
 */
export const QUIET_RECORDING_CONTROL_LABELLED =
  "code-line shrink-0 border border-hair px-2.5 py-1 text-dim transition-colors duration-150 hover:border-accent hover:text-accent";
