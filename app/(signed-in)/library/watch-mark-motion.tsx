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
 * `docs/adr/0001` records that the imported library **already holds 1,156 genuine
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
export const SETTLED_GLYPH =
  "flex items-center justify-center rounded-[var(--radius-full)] border border-hair bg-hair p-1 text-ground transition-colors duration-150 group-hover:bg-transparent group-hover:text-dim";

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
 * built around and the most repeated gesture in it, and `DESIGN.md` §3 already rations the
 * accent to exactly that act — this is the one place in the application allowed to be
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
 * at all — painted the one colour `DESIGN.md` §3 reserves for *this was written* on a press
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
export const RECORDING_GLYPH =
  `flex items-center justify-center rounded-[var(--radius-full)] border border-accent p-1 ${RECORDS_A_WATCH.ink} transition-colors duration-150 group-hover:bg-hair`;

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
  "shrink-0 rounded-[var(--radius-full)] border border-hair p-1 text-dim transition-colors duration-150 hover:border-accent hover:text-accent";

/**
 * `QUIET_RECORDING_CONTROL` at a measure that can hold words — issue #222's *Add —
 * watched*.
 *
 * **This is the same register, not a second one.** Identical hairline border, identical
 * dim ink, identical accent on hover; `code-line px-4 py-2` where the one above takes
 * `p-1`. The measure is not invented either — it is `GHOST_RECOVERY`'s, which is what a
 * control laying out in ordinary flow on a surface takes throughout this build.
 * `errors/recovery-buttons.ts`'s `GHOST_RECOVERY_COMPACT` is the precedent for having two
 * of them at all, and it states the rule both follow: a second **size** of one register is
 * not the third **tier** `DESIGN.md` §10 records as considered and declined. The question
 * of what a neutral tier *is* stays #194's, exactly as the docblock above leaves it.
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
 * ── No `shrink-0`, and that is the instruction being followed rather than an omission ─
 *
 * `GHOST_RECOVERY_COMPACT` bakes `shrink-0` in and says why in the same breath: its one
 * caller is a **fixed-measure** flex slot, *"and only here… if a second caller ever wants
 * this measure outside a fixed slot, that is the moment to split the `shrink-0` back
 * out."* Neither caller of this constant is a fixed slot — one is a wrapping row in
 * ordinary flow, the other is a block inside a text column — so a control that may not
 * give is a control that overflows its column instead of wrapping its label. The two-axis
 * review of #222 caught the first draft carrying it across anyway.
 *
 * ── Its callers are not in this directory, and that is the trade ─────────────────────
 *
 * `app/(signed-in)/search/catalogue-result.tsx` and the unowned title page's
 * `add-to-library-control.tsx`, neither of which is about a watch mark. Naming it here
 * anyway is the lesser of the two costs: this module is where the register is defined and
 * argued, and a copy of the string at either call site is the drift the constant above
 * was extracted to stop — the same drift `errors/recovery-buttons.ts`'s own docblock
 * exists to prevent. If a third register-owning module is ever pulled out of this file,
 * all three constants move together.
 */
export const QUIET_RECORDING_CONTROL_LABELLED =
  "code-line rounded-[var(--radius-full)] border border-hair px-4 py-2 text-dim transition-colors duration-150 hover:border-accent hover:text-accent";

/**
 * The same again at `errors/recovery-buttons.ts`'s compact measure — `px-2.5 py-1` — for
 * the search result row, and the third size in this file rather than a fourth register.
 *
 * The measure is `GHOST_RECOVERY_COMPACT`'s, which is where it now lives: it was
 * `RECORDING_CONTROL`'s first, and issue #217 replaced that text pill with the checkmark's
 * `RECORDING_HIT_BOX` / `RECORDING_GLYPH` pair. `GHOST_RECOVERY_COMPACT` took the number
 * from it character for character while it still existed and is the surviving statement of
 * it, so that is what this cites rather than a constant that is gone.
 *
 * ── Why the search row cannot take the surface measure ───────────────────────────────
 *
 * Measured in a real Chromium tab against the compiled CSS with Archivo loaded, which is
 * how every measurement in this codebase was taken (`DESIGN.md` §6). The row is a `52px`
 * poster at the `poster` utility's `2/3`, so `78px` of picture plus `py-3` — `102px`, and
 * the poster is what sets it. The name, the meta line and this control come to `75.1px`
 * at `px-2.5 py-1`, which fits inside the poster with `2.9px` to spare; at `px-4 py-2` the
 * control is `8px` taller and the column is what sets the row instead, so **every search
 * result grows** for a control that is not the row's primary one.
 *
 * That is the same failure `GHOST_RECOVERY_COMPACT` exists for, arriving by the same
 * route: #195 moved two controls to the surface measure without re-measuring the row they
 * sat in, and the row grew. This is that lesson applied before the fact rather than after.
 *
 * ── The two do not sit side by side, which is why they may differ ────────────────────
 *
 * `SOLID_RECOVERY_COMPACT` forbids the other arrangement — *"the two sit in the same row
 * and a primary at one measure beside secondaries at another is two rows' worth of spacing
 * in one"* — and that rule is about one **control group**. On the search row the primary
 * is a `34px` accent pill in the trailing slot and this is a chip in the text column, two
 * cells apart with a poster's worth of layout between them; on the unowned title page the
 * two *are* one group, and there they take the same measure. Both surfaces obey the rule
 * the constant above and this one exist to keep.
 */
export const QUIET_RECORDING_CONTROL_LABELLED_COMPACT =
  "code-line rounded-[var(--radius-full)] border border-hair px-2.5 py-1 text-dim transition-colors duration-150 hover:border-accent hover:text-accent";
