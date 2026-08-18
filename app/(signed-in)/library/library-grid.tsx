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
 * of which the plate takes 78px, the gap 16px and the padding 32px — **68px for a title
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
 * column count is the only thing that changes between devices.* The plate keeps its
 * measure, the title keeps its step, the cell keeps its shape — there is no phone
 * stylesheet, no smaller type ramp and no second layout. The alternative fixes were all
 * larger: shrinking the type would add a device-dependent ramp step, and stacking the
 * plate above the title would make the *cell* differ between devices, which is the thing
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
 * ── Structure is drawn, not spaced ───────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Hairline Rule: cells are divided by `1px` `rule` borders on their bottom
 * and right edges — not by gaps, not by cards. There is no `gap` on this grid for the same
 * reason there is no radius and no shadow anywhere in this application.
 *
 * ── 472 of these ─────────────────────────────────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §7 sizes the library at 472 titles on day one, and this
 * renders all of them. No pagination, no virtual list, no "show more": the whole point of
 * the screen is *your library as a place you can look at, rather than a query you can
 * run*, and 472 rows of already-fetched text is not what makes a page slow. What would is
 * 472 network requests for artwork, which is why `app/plate.tsx` marks every poster
 * `loading="lazy"` — the browser fetches the plates a reader actually scrolls to.
 *
 * This is a server component and stays one. Nothing in a cell takes input until #58, so
 * shipping 472 cells to the browser as client components would be paying hydration for a
 * printed sheet.
 */
export function LibraryGrid({ entries }: { entries: readonly LibraryEntryRow[] }) {
  return (
    <ol
      // The heading this list is under, taken from the heading itself rather than passed
      // in: there is one library heading, and a prop would let a caller point the list at
      // something else without anything noticing.
      aria-labelledby={LIBRARY_HEADING_ID}
      className="grid grid-cols-1 bg-ink sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {entries.map((entry) => (
        <LibraryEntryCell key={entry.libraryEntryId} entry={entry} />
      ))}
    </ol>
  );
}
