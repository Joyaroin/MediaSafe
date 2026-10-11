import { RECORDS_A_WATCH } from "@/app/accent-meaning";

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
 * **The tick — Charcoal, issue #397 (handoff §6).** A `26px` circle with one of three
 * faces, drawn inside `RECORDING_HIT_BOX`'s `44px` target:
 *
 * - **Not watched** — a `1.5px` `dim` ring and a `dim` glyph (`RECORDING_GLYPH`).
 * - **Up next** — the same ring in `text` (`RECORDING_GLYPH_UP_NEXT`): the one episode a
 *   reader is about to press, set a step brighter than the rest of its season.
 * - **Watched** — filled: `text` ground, `ground` glyph (`SETTLED_GLYPH`). *Filled* means
 *   a recorded watch, the one place outside a primary button it is allowed to.
 *
 * Watched is never colour alone: it is a filled shape against a ring, and the state is in
 * each button's accessible name. The accent-era docblocks below keep their history; where
 * they say *vermilion*, *accent* or *hairline* about a face, these three lines replace it.
 */
const TICK =
  "flex size-6.5 items-center justify-center rounded-[var(--radius-full)] transition-colors duration-[var(--dur-fast)]";

/** The watched face alone, for a tick that is not itself a control — the Up next card's,
 *  while it holds after a mark. `SETTLED_GLYPH` below is this plus the hover that says
 *  pressing it takes the watch back. */
export const WATCHED_TICK = `${TICK} border-[1.5px] border-text ${RECORDS_A_WATCH.solid}`;

/**
 * **The settled watch mark, which is also the control that takes it back.** This is the
 * whole of what a watched row now carries, and it replaces the pair of `code-line` text
 * pills — *Rewatch* and *Unwatch* — that issue #89 put there and #195 moved onto
 * `GHOST_RECOVERY_COMPACT`.
 *
 * ── Rewatch is deleted, and that is a product decision rather than a tidy-up ─────────
 *
 * There is no longer any control in the application that records a **second** watch of an
 * episode by hand. The concept survives untouched everywhere it actually lives: the
 * `watch` table, its `UNIQUE (user_id, source, source_key)` identity rule, and the
 * rewatch dedupe in `db/access.ts`'s read paths are all exactly as they were, because
 * the imported library **already holds 1,156 genuine
 * rewatches** (1,129 at occurrence `:2`, 27 at `:3`). Deleting the concept would have
 * taken that history with it. Deleting the button takes nothing.
 *
 * Note what this does not offer, so that nobody re-derives it as an oversight: unwatching
 * and marking again is **not** a rewatch. It destroys the first watch's date rather than
 * adding a row beside it. That is the trade the deletion makes, taken knowingly.
 *
 * ── Why the state is the control, rather than sitting beside a control ───────────────
 *
 * A finished season was twenty-two rows each carrying two text buttons, both of them
 * pressed approximately never, at the same weight as the one control a reader presses
 * every evening. `programme-note-episodes.tsx`'s own measurement table put that pair at
 * `149.9px` — `183.9px` with *watched up to here* beside it — which is what forced
 * `TRAILING` to a fixed `192px` and left the episode **name** about `190px` at a `420px`
 * pane. The long names were not too long; the row was too full.
 *
 * So the mark itself became the button: one `44px` hit box in every row state, and the
 * `w-48` slot collapses to `w-11`. `EPISODE_NAME_CELL` gets the difference.
 *
 * ── The treatment, and the one colour rule it is obeying ─────────────────────────────
 *
 * Dim, filled, and emphatically **not** accent. `app/globals.css` rations the accent to
 * three roles and *Live* — recording a watch — is the first of them; a settled mark is a
 * watch that was already recorded, so painting this vermilion would spend the accent on
 * every row of a finished season and leave the one unrecorded episode indistinguishable.
 * `bg-hair` with the glyph in `text-ground` is the fill, which is the same tone step the
 * whole application uses for depth and the only one it has.
 *
 * **It hollows out on hover** rather than lighting up: the fill drops away and the check
 * is left in `text-dim` inside its own hairline ring. That is the row saying *this can be
 * pressed* without ever claiming to be the recording control, which is the thing directly
 * above it in every unwatched row.
 *
 * `group-hover:` and not `hover:`, for `RECORDING_GLYPH`'s reason exactly: the pointer is
 * over `RECORDING_HIT_BOX`, which is `9px` larger on every side, so the state has to
 * answer to the group rather than to this element.
 */
export const SETTLED_GLYPH = `${WATCHED_TICK} group-hover:bg-transparent group-hover:text-text`;

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
 * ceiling `min-h-11` was measured to hold (`episode-line.ts`) and the one
 * `RECORDING_CONTROL`'s old `26.2px` text pill sat comfortably under. The button's border
 * box still paints the full `44px`; the margin only stops that box from pushing the row
 * taller, the same trick `masthead.tsx`'s Settings link plays sideways instead of down.
 *
 * `group`, so `RECORDING_GLYPH` below can invert on a hover over the *hit box*, not over
 * the smaller chip drawn inside it — the whole reason the two are separate elements.
 *
 * **`pressable` is new, and it is the point of issue #270.** This control had a hover
 * invert and nothing at all under a thumb — and a hover is the one state a phone cannot
 * enter, so the gesture the whole product is built around was the only one in the
 * application with no physical answer. It now carries the same press every tile, cell and
 * row wears (`globals.css`'s `@utility pressable`), which since #281 is a 100ms
 * compression and a `snappy`-derived pop keyframe. On the hit box rather than on
 * `RECORDING_GLYPH`, for the same reason the hover is: the `44px` box is what a finger is
 * actually on, and scaling the `26px` chip inside a box that stayed still would read as
 * the chip coming loose. It costs no client boundary — this file is class strings, and
 * the surfaces rendering them stay server components.
 *
 * **`[--press-register:2]` is the loud register, and it is the whole of issue #283.**
 * `pressable` had one movement for a 262px rail card and a 44px checkmark alike, and 4% on
 * a 44px box moves its edge 0.88px — under a device pixel, which is to say not at all.
 * #282 gave the small controls a register of their own (`0.92` in, `1.030` past rest) and
 * this took it. #283 gives this control a third one above that: **`0.900` in and `1.045`
 * past rest, the loudest press in the application**, declared by the same single property
 * and reached from nowhere else but here and the Up next card's own check.
 *
 * **Why this control and not the others.** Recording a watch is the act the product is
 * built around and the most repeated gesture in it, and the
 * accent is already rationed to exactly that act — this is the one place in the application allowed to be
 * vermilion, and it is now the one place allowed to move this far. The motion and the
 * colour come to say the same thing rather than two different things.
 *
 * **It is scale and the pop and nothing else.** No tint under the thumb: colour continues
 * to mean *this was recorded*, and a control that took the accent while being pressed
 * would be claiming to have written something it has not — the accent on `RECORDING_GLYPH`
 * below is the rest state and it is what marks the recorded one. No shadow either, because
 * the application's one depth vocabulary is the raised/ground tone step and a bare 44px hit
 * box has no ground of its own to settle toward (`globals.css`'s tone rule is qualified by
 * `.bg-raised`, which this box deliberately does not wear).
 *
 * One property and not two, set here rather than reached for as a second utility, for
 * `--poster-radius`'s reason restated two paragraphs up: two utilities setting one
 * property are resolved by the order Tailwind emits them in. `app/globals.css`'s
 * `@utility pressable` derives both halves of the press from this one value.
 */
export const RECORDING_HIT_BOX =
  "pressable [--press-register:2] group -my-2 flex h-11 w-11 shrink-0 items-center justify-center";

/**
 * The recording control's visible chip — the old `RECORDING_CONTROL`'s `1px` `accent`
 * border and `accent` text drawn around `CheckmarkIcon` instead of its own text. Sized to
 * the glyph (`p-1` around `h-4 w-4`) rather than to a label, because there is no longer a
 * label to hold — `26px` square, unchanged from the `26.2px` box `MarkUpToIcon`'s own
 * docblock already paired it with.
 *
 * **Issue #313: hover no longer inverts to solid.** It used to, on the same reasoning
 * `GHOST_RECOVERY` inverts on hover elsewhere — but this is not that register. `§3` rations
 * the accent to *recording a watch*, and `errors/recovery-buttons.ts`'s ghost pair inverting
 * under a pointer is fine precisely because none of those fourteen controls claim to have
 * *written* anything by filling; this one does. An unwatched row's checkmark going
 * `bg-accent`/`text-accent-ink` on a hover — no press, no write, sometimes no pointer device
 * at all — painted the one colour reserved for *this was written* on a press
 * that had not happened, the exact reasoning `RECORDING_HIT_BOX`'s own docblock already
 * gives for why a *press* may not tint: *"a control that took the accent while being pressed
 * would be claiming to have written something it has not."* Hover is a weaker gesture than a
 * press and was making a stronger claim.
 *
 * `group-hover:bg-hair` replaces the fill: the same neutral tone step `SETTLED_GLYPH` uses
 * for its own ground, so the box still visibly answers a pointer — it still reads as
 * pressable — without spending the reserved colour on it. The border and the glyph stay
 * `RECORDS_A_WATCH.ink`, unchanged at rest and on hover alike: this is still the one control
 * allowed to be vermilion, because pressing it is what records the watch. Only the fill that
 * used to arrive on hover is gone.
 *
 * `group-hover:`, not `hover:`, is unchanged and for its original reason: the element a
 * pointer sits over is `RECORDING_HIT_BOX`, `9px` wider than this on every side, so the
 * state has to answer to the group rather than to itself. `MarkWatchedButton` composes both
 * of these with `errors/recovery-buttons.ts`'s `IN_FLIGHT`, on the hit box — a `filter:
 * brightness()` dims everything it paints, chip included, so `IN_FLIGHT` needs no second
 * copy here.
 *
 * **Declares `RECORDS_A_WATCH` — issue #313, the migration `app/accent-meaning.ts`'s own
 * docblock left to whichever ticket next opened this file.** `border-accent` stays a
 * literal: `AccentMeaning` exports no border form, the same gap `errors/recovery-buttons.ts`'s
 * ghost pair fills the same way. `tests/accent-sweep.test.ts`'s manifest holds this file to
 * eight accent tokens now, down from ten — the two the hover fill used to spend are gone,
 * not migrated, because there is no fill left to declare.
 */
export const RECORDING_GLYPH = `${TICK} border-[1.5px] border-dim text-dim group-hover:bg-hair`;

/** The tick on the Up next episode — `RECORDING_GLYPH`'s ring and glyph in `text`. */
export const RECORDING_GLYPH_UP_NEXT = `${TICK} border-[1.5px] border-text text-text group-hover:bg-hair`;
