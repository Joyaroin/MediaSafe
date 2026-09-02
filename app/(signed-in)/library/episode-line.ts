import { LIVE_EDGE_OF_THE_RECORD } from "@/app/accent-meaning";

/**
 * `DESIGN.md`'s Episode Line, as the four class strings that draw it — written once for
 * the reason `programme-note-section.ts` and `errors/recovery-buttons.ts` give for their
 * own: a treatment copied is a treatment that becomes two treatments the first time one
 * of them is adjusted.
 *
 * Issue #148 is what made that a real risk rather than a tidiness argument. There are two
 * episode lists now — the owned one, whose every row is a control, and the unowned one,
 * whose rows are text — and `programme-note-episodes.tsx`'s docblock explains at length
 * why they are two components rather than one with the controls made optional. What that
 * argument justifies is two *components*, not two copies of the row's measurements.
 *
 * And these are measurements. `programme-note-episodes.tsx` records `getBoundingClientRect`
 * runs at three pane widths, over every state the owned row has, establishing that the row
 * does not resize when it is marked — `min-h-11` and `w-9` are that result, not a guess.
 * A second copy of them is a second row that was never measured, and it would drift from
 * the first silently, because nothing about a class string typed twice looks wrong.
 */

/**
 * The row. `programme-note-episodes.tsx` adds `relative` to this — its sweep is absolutely
 * positioned inside the row and must not take up flow space — and the unowned row, having
 * no sweep, does not.
 *
 * ── `py-2`, and why it is not `py-2.5` any more ──────────────────────────────────────
 *
 * The sentence-case type re-cut grew `code-line` from `0.625rem`/`1.1` to `0.75rem`/`1.35`
 * — a bigger step than it looks, because taking the caps off a label costs about a third
 * of its x-height and the size had to rise to pay that back. `RECORDING_CONTROL` is a
 * `code-line` inside a border with `py-1`, so its box went `20.9px` → `26.2px`, and at
 * `py-2.5` that pushed the unwatched row to `46.2px` while the settled row still sat on
 * `min-h-11`'s `44px`.
 *
 * **That is the row shrinking under the thumb as the mark lands** — the exact thing
 * `min-h-11` was measured into existence to prevent. `DESIGN.md` §6 says *re-measure if
 * you touch the row*, and this is what the re-measure found.
 *
 * Taking `2px` off each side is the fix that costs nothing visible: `min-h-11` still
 * dominates (`26.2 + 16 = 42.2` is under `44`), so the row renders at the same `44px` it
 * always did, with the same control at the same size. Raising the floor to `min-h-12`
 * would also have worked and was rejected — it makes every row in a long season 9% taller
 * to solve a problem the padding can absorb.
 *
 * Re-measured in Chromium against the compiled CSS, all four states — unwatched, up-next,
 * marking, settled — at both pane widths:
 *
 * | Pane | `py-2.5` (before) | `py-2` (now) |
 * |---|---|---|
 * | `420px` | `46.2 / 46.2 / 44 / 44` — resizes 2.2px | `44 / 44 / 44 / 44` — stable |
 * | `375px` | `46.2 / 46.2 / 44 / 44` — resizes 2.2px | `44 / 44 / 44 / 44` — stable |
 */
export const EPISODE_ROW = "flex min-h-11 items-center gap-3 py-2";

/**
 * The `E1` label: dim, fixed-width, tabular. The owned row swaps this for an accent chip
 * on the one episode that is up next; nothing on the unowned row can, because being next
 * is a fact about a reader and that list has none.
 */
export const EPISODE_NUMBER = "code-line w-9 shrink-0 text-dim";

/**
 * The same `E1` label, inverted — the one episode that is up next, wherever its number is
 * drawn. `EpisodeLine` swaps to this from `EPISODE_NUMBER` above when `episode.upNext`; the
 * up-next row (`up-next-row.tsx`, issue #228) is always showing that episode, so it draws
 * this and never the dim variant. Written once for the same reason every constant in this
 * file is: a second copy of this exact string is a second row that was never measured
 * against the first, and it would drift silently the day one of them changed.
 *
 * Issue #310: the accent here claims `LIVE_EDGE_OF_THE_RECORD` (`app/accent-meaning.ts`) —
 * `DESIGN.md` §12's own words for it are *the strongest case for a second meaning: up next
 * is the live edge of the record, and this is the one place it is marked*.
 */
export const EPISODE_NUMBER_UP_NEXT = `code-line w-9 shrink-0 ${LIVE_EDGE_OF_THE_RECORD.solid} px-1 py-0.5 text-center`;

/** The name's cell. `min-w-0` and the `truncate` inside it are what keep a long name from
 *  wrapping and taking the row's measured height with it. */
export const EPISODE_NAME_CELL = "min-w-0 flex-1 text-item";

/** One season's rows, under its heading. */
export const SEASON_LIST = "mt-3 divide-y divide-hair";
