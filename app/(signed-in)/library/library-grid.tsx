import type { LibraryEntryRow } from "@/db/access";
import { LibraryEntryCell } from "./library-entry-cell";
import { LIBRARY_HEADING_ID } from "./library-heading";

/**
 * The bill: every library entry, in one grid.
 *
 * ── The column count is the only thing that changes ──────────────────────────────────
 *
 * `SPEC.md` §7 lists the three places the phone and the desktop genuinely diverge, and
 * the library grid is in none of them: *"the library tile and grid. Same component, same
 * information. Column count differs; nothing else does."* So there is exactly one `grid`
 * here with two breakpoints on it, and no second layout to keep in step.
 *
 * **2 columns, 3 at `≥1280px` (`xl:`), 4 at `≥1536px` (`2xl:`)** — `DESIGN.md`'s Layout
 * section, and the reference build's `grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`
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
 * prototype's phone has no grid at all, and `DESIGN.md`'s Phone section says so. `SPEC.md`
 * §7 overrules that and puts the same grid on both devices, and this is the consequence
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
 * (`DESIGN.md`'s Phone section says the bill's grid *"is not rendered at all on phone"*.
 * That is the reference build describing itself — the prototype's phone screen is TONIGHT
 * and a deck, and its grid is behind `hidden lg:block`. `SPEC.md` §7 is the later document
 * and settles it the other way, and #56 says so in as many words: *the column count is the
 * only thing that changes between devices*. The phone reaches this through its own tab,
 * which is build step 5's.)
 *
 * ── Structure was drawn, not spaced. Turn 9 spaces it ────────────────────────────────
 *
 * `DESIGN.md`'s Hairline Rule had cells divided by `1px` `hair` borders on their bottom
 * and right edges — not by gaps, not by cards, no `gap` on this grid and no radius on a
 * cell. The linen redesign reverses that here: the cells are `--raised` cards at an
 * `18px` radius with a `10px` gap between them, and the hairlines are gone.
 *
 * The reversal is what the new palette buys. Under #134's light values `--raised` was
 * `#ffffff` against a `#f6f5f3` ground — a card would have been a white box on off-white,
 * which is why that world drew its structure in lines and needed the Hairline Rule to say
 * so. The handoff puts `--raised` *below* the ground (`#eeede6` on `#f7f5ed`), so a card is
 * a well pressed into the sheet and reads as a distinct object with no line around it and
 * no shadow under it. Same information, same measure, one fewer device drawing it.
 *
 * There is still **no shadow anywhere** — `docs/design/prototypes/mediasafe-mobile-handoff.md`
 * is explicit in its Geometry table that the tone difference between `--raised` and
 * `--ground` is the only lift in the design.
 *
 * ── 472 of these ─────────────────────────────────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §7 sizes the library at 472 titles on day one, and this
 * renders all of them. No pagination, no virtual list, no "show more": the whole point of
 * the screen is *your library as a place you can look at, rather than a query you can
 * run*, and 472 rows of already-fetched text is not what makes a page slow. What would is
 * 472 network requests for artwork, which is why `app/poster.tsx` marks every poster
 * `loading="lazy"` — the browser fetches the posters a reader actually scrolls to.
 *
 * **Amended by #57, then by #58.** This component itself still takes no input and is
 * still not marked `"use client"`. #57 put it inside `LibrarySurface`'s client boundary
 * regardless — the chip and the filter-by-typing field (`SPEC.md` §7) narrow this same
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
const FIRST_ROW = 4;

export function LibraryGrid({ entries }: { entries: readonly LibraryEntryRow[] }) {
  return (
    <ol
      // The heading this list is under, taken from the heading itself rather than passed
      // in: there is one library heading, and a prop would let a caller point the list at
      // something else without anything noticing.
      aria-labelledby={LIBRARY_HEADING_ID}
      // `px-[14px]` and not the page's `22px`: the cell's own `14px` padding is inside
      // the card, so a `14px` list gutter is what puts the card's *edge* on 22px. Turn
      // 9's rule for every list that carries cards, and the reason the search results
      // and the list rows carry the same number.
      // No `lg:` gutter override: `SPEC.md` §7 allows the column count to be the only
      // thing that differs between devices, and `tests/library-surface.test.ts` enforces
      // it by rejecting any breakpoint prefix here that is not `grid-cols`. The `14px`
      // gutter is the measure at every width.
      className="stagger-rise mt-5 grid grid-cols-1 gap-2.5 px-[14px] pb-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {entries.map((entry, index) => (
        <LibraryEntryCell
          key={entry.libraryEntryId}
          entry={entry}
          aboveFold={index < FIRST_ROW}
        />
      ))}
    </ol>
  );
}
