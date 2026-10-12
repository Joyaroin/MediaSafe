import type { LibraryEntryRow } from "@/db/access";
import { LibraryEntryCell } from "./library-entry-cell";
import { SelectionOrderProvider } from "./selectable-entry";
import { LIBRARY_HEADING_ID } from "./library-heading";

/** The grid's columns, gaps and gutters — shared with its loading state (`loading.tsx`), so
 *  the wait is the grid it becomes. The reasoning for each value is beside the `<ol>`. */
export const LIBRARY_GRID =
  "grid grid-cols-3 gap-x-3.5 gap-y-5 px-gutter pb-6 sm:grid-cols-4 lg:px-10 xl:grid-cols-5 2xl:grid-cols-6";

/**
 * The bill: every library entry, in one grid.
 *
 * ── The column count is the only thing that changes ──────────────────────────────────
 *
 * Three places are where the phone and the desktop genuinely diverge, and
 * the library grid is in none of them: *"the library tile and grid. Same component, same
 * information. Column count differs; nothing else does."* So there is exactly one `grid`
 * here with two breakpoints on it, and no second layout to keep in step.
 *
 * **2 columns, 3 at `≥1280px` (`xl:`), 4 at `≥1536px` (`2xl:`)** — the Layout
 * register, and the reference build's `grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`
 * verbatim.
 *
 * ── And **one** column below `640px`, which is a deviation, on evidence ──────────────
 *
 * Issue #56 asks for two columns by default. On a phone that does not read, and it was
 * measured rather than guessed: at a 388px viewport, two columns leave a cell 194px wide,
 * of which the poster takes 78px, the gap 16px and the padding 32px — **68px for a title
 * set at `2.15rem`**. Every name then breaks to two or three letters a line, and before
 * `break-words` was added to the cell the overflow scrolled the whole page sideways
 * (552px of content in a 388px viewport).
 *
 * The reference build never met this, because its bill is `hidden lg:block` — the
 * prototype's phone has no grid at all, and the Phone register said so. That is
 * overruled: the same grid goes on both devices, and this is the consequence
 * of the overrule arriving at 390px.
 *
 * One column is the smallest answer that stays inside the ticket's own constraint: *the
 * column count is the only thing that changes between devices.* The poster keeps its
 * width, the title keeps its step, the cell keeps its shape — there is no phone
 * stylesheet, no smaller type ramp and no second layout. The alternative fixes were all
 * larger: shrinking the type would add a device-dependent ramp step, and stacking the
 * poster above the title would make the *cell* differ between devices, which is the thing
 * §7 and #56 both forbid.
 *
 * Two columns return at `sm` (`≥640px`), where a cell is 320px and the title has 194px —
 * enough for the longest ordinary name.
 *
 * (The Phone register said the bill's grid *"is not rendered at all on phone"*.
 * That is the reference build describing itself — the prototype's phone screen is TONIGHT
 * and a deck, and its grid is behind `hidden lg:block`. The later ruling
 * settles it the other way, and #56 says so in as many words: *the column count is the
 * only thing that changes between devices*. The phone reaches this through its own tab,
 * which is build step 5's.)
 *
 * ── Structure was drawn, not spaced. Turn 9 spaces it ────────────────────────────────
 *
 * The Hairline Rule had cells divided by `1px` `hair` borders on their bottom
 * and right edges — not by gaps, not by cards, no `gap` on this grid and no radius on a
 * cell. The linen redesign reverses that here: the cells are `--raised` cards at an
 * `18px` radius with a `10px` gap between them, and the hairlines are gone.
 *
 * The reversal is what the new palette buys. Under #134's light values `--raised` was
 * `#ffffff` against a `#f6f5f3` ground — a card would have been a white box on off-white,
 * which is why that world drew its structure in lines and needed the Hairline Rule to say
 * so. The linen handoff put `--raised` *below* the ground (`#eeede6` on `#f7f5ed`), so a
 * card was a well pressed into the sheet and read as a distinct object with no line around
 * it and no shadow under it. Same information, same measure, one fewer device drawing it.
 * Charcoal (issue #395) puts `--raised` back *above* the ground in light — white on
 * `#f4f2ee` — and the tone step is still the only lift.
 *
 * There is still **no shadow anywhere** — the Geometry table is
 * explicit that the tone difference between `--raised` and
 * `--ground` is the only lift in the design.
 *
 * ── 472 of these ─────────────────────────────────────────────────────────────────────
 *
 * The library is sized at 472 titles on day one, and this
 * renders all of them. No pagination, no virtual list, no "show more": the whole point of
 * the screen is *your library as a place you can look at, rather than a query you can
 * run*, and 472 rows of already-fetched text is not what makes a page slow. What would is
 * 472 network requests for artwork, which is why `app/poster.tsx` marks every poster
 * `loading="lazy"` — the browser fetches the posters a reader actually scrolls to.
 *
 * **Amended by #57, then by #58.** This component itself still takes no input and is
 * still not marked `"use client"`. #57 put it inside `LibrarySurface`'s client boundary
 * regardless — the chip and the filter-by-typing field narrow this same
 * already-fetched array without a second database read, and the only place that slice can
 * happen is client state above this component, so 472 cells now hydrate whether or not any
 * one of them takes input. That is the trade this ticket takes deliberately rather than
 * the one #56 assumed. Sort stays the exception: it changes the `ORDER BY` itself
 * (`db/access.ts`), so it is the one control that is a real navigation and re-runs the
 * query in `page.tsx`.
 *
 * #58 is what actually gives a cell a click target, and it does not change any of that:
 * `selectable-entry.tsx` is a thin client wrapper each cell's button sits inside, with the
 * rest of the cell — poster, title, state line — passed to it as `children` and rendered
 * exactly as before. It adds no *further* client boundary; it is already inside the one
 * #57 opened.
 */
/**
 * The widest this grid's own `grid-cols-*` breakpoints get (`2xl:grid-cols-4` above) — the
 * upper bound on how many entries can share a first row at any width this grid renders at.
 * Marking exactly this many `aboveFold` covers every breakpoint's real first row without
 * measuring one at render time; a narrower breakpoint just marks a couple of rows eager
 * rather than one, never the whole 472-entry library (`app/poster.tsx`).
 */
/** Two rows of the widest column count — what a first paint can be asked for without
 *  guessing at the viewport. */
const FIRST_ROW = 12;

export function LibraryGrid({
  entries,
  labelledBy = LIBRARY_HEADING_ID,
}: {
  entries: readonly LibraryEntryRow[];
  /**
   * The heading this list sits under. Defaults to the screen title, which is the whole
   * truth in Shows mode — one grid, one heading.
   *
   * Films mode draws three grids under three group headings, and each has to name its own
   * or a screen reader is told three times that this list is *The library* and never which
   * part of it. The default is what keeps the common case honest: a caller that passes
   * nothing gets the screen heading, so this cannot silently become unlabelled.
   */
  labelledBy?: string;
}) {
  return (
    <SelectionOrderProvider
      titles={entries.map((entry) => ({
        libraryEntryId: entry.libraryEntryId,
        titleId: entry.titleId,
        name: entry.name,
      }))}
    >
      <ol
        aria-labelledby={labelledBy}
        // `px-gutter`, `lg:px-10`: the page's own edges, so the first poster lines up
        // under the heading and the chips. It was `14px`/`34px` while the cell was a card
        // with `14px` of its own padding; a poster has none, so the grid takes the gutter
        // itself (Charcoal, issue #402). `tests/library-surface.test.ts` allows this and
        // nothing else.
        // **Columns, not rows.** The cell is a poster with a name under it now
        // (`library-entry-cell.tsx`), so the grid counts in artwork rather than in
        // full-width cards: three across on a phone, up to six on a wide desktop, which is
        // the lists grid's own ramp (`lists/[listId]/list-icon-grid.tsx`) because they are
        // the same content at the same size.
        //
        // `gap-x-3.5 gap-y-5` rather than one `gap-2.5`: the cells are no longer cards on a
        // `--raised` ground, so what separates two of them sideways is whitespace alone,
        // and the vertical gap has to clear a two-line name plus a state label before the
        // next poster starts. Equal gaps in both directions read as a denser grid than it
        // is.
        className={`stagger-rise mt-5 ${LIBRARY_GRID}`}
      >
        {entries.map((entry, index) => (
          <LibraryEntryCell
            key={entry.libraryEntryId}
            entry={entry}
            aboveFold={index < FIRST_ROW}
          />
        ))}
      </ol>
    </SelectionOrderProvider>
  );
}
