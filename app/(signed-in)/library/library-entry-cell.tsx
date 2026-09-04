import type { LibraryEntryRow } from "@/db/access";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import { railPosterTransitionName } from "./poster-transition-name";
import { SelectableEntry } from "./selectable-entry";
import { SelectionCheckBadge } from "./selection-check-badge";

/**
 * One programme entry — the bill's grid cell, and the only thing 472 of them are made of.
 *
 * ── What it was, and what turn 9 made it ─────────────────────────────────────────────
 *
 * `DESIGN.md`, Components, described this cell as *a full-width button, **not a card**.
 * Ground `ground`, hairline right and bottom borders, `1rem` padding, `1rem` gap. Left:
 * the plate at `78×104px` … Hover fills the cell with `raised`. No shadow, no lift, no
 * radius, no scale.* Almost none of that sentence survives, and this docblock quoted it
 * as current for one commit after it stopped being true.
 *
 * What it is now: **a card**. `--raised` ground at an `18px` radius, `14px` padding and
 * gap, a `66px` poster at a `10px` radius, and no borders at all — `library-grid.tsx`
 * spaces the cells rather than ruling them apart. There is no hover fill, because the
 * cell is already the raised surface the hover used to reach for; `pressable` is the
 * acknowledgement instead. Still **no shadow and no lift**: the `--raised`/`--ground`
 * tone step is the only depth in the redesign.
 *
 * The plate went to a poster in #135 (`app/poster.tsx`); `DESIGN.md` was rewritten from
 * the built world in #144, and its section 0 now records this reversal among the rest.
 *
 * ── Where the button goes, since #58 ──────────────────────────────────────────────────
 *
 * `selectable-entry.tsx`'s own docblock has the mechanism — a click here selects the
 * entry on desktop and pushes the phone route, and neither is this file's concern. What
 * stayed true from #56 is the element: a `button` rather than a `div`, because that is
 * what #56's acceptance criteria specified and what #58 attached a handler to rather than
 * rewriting.
 *
 * ── Abandoned is the only modified poster ────────────────────────────────────────────
 *
 * An abandoned title's poster drops to `opacity: .55` and its name drops to `--dim`; that
 * pairing is the only place the poster is modified. Both halves are here and nowhere else
 * — one without the other reads as a rendering fault rather than as a state.
 *
 * `.55` since turn 9, up from `.45`, and the same number the phone's deleted group tile used on the
 * Up next Abandoned group — the handoff names this cell as the surface that already dims
 * a poster and asks that the two not be left different by accident.
 *
 * ── The bar, since issue #324, and on the artwork since ─────────────────────────────
 *
 * A show's card carries a thin bar of watched-against-released. It is `PosterProgressBar`
 * (`app/poster-progress-bar.tsx`), which owns the whole of it now — the fraction, the
 * absences that draw nothing, and the argument for being on the poster's bottom edge
 * rather than on a line of its own under the name. This file passes `entry.progress` and
 * decides nothing about it.
 *
 * What it cost to move: nothing this cell had to give up. The bar under the name added a
 * row of height to every one of 472 cells to say a thing about the poster above it; inside
 * the poster it is free, and the name sits back against the artwork it names.
 *
 * **The bar takes the accent, and the state word is gone** — the same trade
 * `title-hero.tsx` made on the title's own page, settled here the other way round. That
 * file kept the word in `--dim` and gave the bar the accent because the two sat in one
 * block saying the same thing; on the bill the word said it 472 times over, once per
 * card, and a reader scanning the grid is reading the *filter* they are inside, not each
 * cell's repetition of it. So the word goes entirely and the bar keeps the accent: *how
 * far through you are right now* is the most literal reading of live, and it is the same
 * `LIVE_EDGE_OF_THE_RECORD` role the filter bar's unselected *Watching* chip already
 * spends on this screen — one role, not two.
 *
 * The bar is drawn for every state that has progress at all, not only *Watching*. A
 * finished show's bar is simply full, which is the fact rather than a second colour. An
 * abandoned title's bar dims with the poster, because it is inside it — the one place this
 * cell modifies the artwork now modifies the bar with it, which is right: they are the
 * same title in the same state.
 *
 * **No numeral anywhere near it** — DESIGN.md §11's own remaining rule, amended by this
 * ticket rather than reopened: a count may not stand as chrome on a surface reached to do
 * something else, and this bar is chrome by construction.
 *
 * ── The poster leaves as its own prop, since issue #303 ──────────────────────────────
 *
 * The `relative` wrapper the check badge hangs off used to live here; it moved into
 * `selectable-entry.tsx`, which is the one place that can put the morph's transition name
 * on it without this file gaining a client boundary. This file still builds the poster —
 * it stays a server component either way — it just hands the finished element over rather
 * than rendering it directly inside the button.
 */

/**
 * The poster's width in the bill grid — `66px` since turn 9, down from the `78px` that
 * was one of `DESIGN.md`'s five fixed measures before #135. It is fixed at every
 * breakpoint: the column count is what changes between a phone and a desktop, and nothing
 * else is (`SPEC.md` §7). Height is not set — the `poster` utility's `2/3` aspect ratio
 * derives it from this width, so a real poster is never cropped to fit a fixed box.
 *
 * `66` and `78` land in the same `w92` CDN bucket, so the smaller measure changes what is
 * drawn and not what is fetched (`app/poster.tsx`).
 */
/**
 * The poster's rendered width at the narrowest column this grid draws — what `Poster`
 * resolves to a TMDB bucket, and what its missing-artwork initials scale off.
 *
 * `132px` and not the `66px` this cell drew beside its text: the cell is a **column** now,
 * and the poster is the width of it. `up-next-episode-row.tsx` and the lists grid ask for
 * the same number, so all three resolve to the same bucket and the browser caches one
 * image per title across the application.
 */
const BILL_POSTER_WIDTH = 132;
const BILL_POSTER = "w-full [--poster-radius:var(--radius-4)]";

export function LibraryEntryCell({
  entry,
  aboveFold = false,
}: {
  entry: LibraryEntryRow;
  /** This cell is in the bill's first visible row — `library-grid.tsx`'s to say, since it
   *  is the one that knows the column count (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  const abandoned = entry.state === "abandoned";

  return (
    <li className="offscreen-skippable">
      <SelectableEntry
        title={{
          libraryEntryId: entry.libraryEntryId,
          titleId: entry.titleId,
          name: entry.name,
        }}
        className="pressable block w-full text-left"
        posterPath={entry.posterPath}
        // Issue #303: the one name family every poster morph pairs against
        // (`poster-transition-name.ts`) — the cell's own half of it, the fourth caller
        // beside the rail row, the desktop pane and the title's own page.
        posterTransitionName={railPosterTransitionName(entry.libraryEntryId)}
        poster={
          <>
            {/* `.55` for an abandoned title, on both surfaces that dim one. The linen
                ground is lighter than the bone one this number was chosen against, so the
                same title reads as further gone at the same opacity. */}
            <Poster
              posterPath={entry.posterPath}
              name={entry.name}
              width={BILL_POSTER_WIDTH}
              className={abandoned ? `${BILL_POSTER} opacity-55` : BILL_POSTER}
              aboveFold={aboveFold}
            >
              {/* On the artwork, not under the name — `poster-progress-bar.tsx` has the
                  argument. An abandoned title's bar dims with the poster it is inside,
                  which is the pairing this cell has always drawn. */}
              <PosterProgressBar progress={entry.progress} />
            </Poster>
            {/* Renders nothing at all outside a selection provider — the desktop, always. */}
            <SelectionCheckBadge libraryEntryId={entry.libraryEntryId} />
          </>
        }
      >
        {/*
          `break-words` is not decoration, and the measurement behind it survives the
          re-layout intact: a long unbroken word — `ENGAGEMENT`, `Neighbourhood`, most of a
          German title — cannot wrap, and in a grid column it pushes the column open and
          the page gains a horizontal scrollbar. It was measured at 388px against the old
          row layout (552px of content in a 388px viewport) and a column is narrower than
          that row was, so the case is if anything easier to hit.

          `line-clamp-2` is new and is what a column costs: the row this replaced let a
          name run to as many lines as it wanted, because nothing was underneath it. Here a
          third line makes one cell taller than its neighbours, and in a grid that is a
          ragged row rather than one long name.
        */}
        <p
          className={`mt-2 line-clamp-2 break-words text-item leading-snug font-medium ${abandoned ? "text-dim" : "text-ink"}`}
        >
          {entry.name}
        </p>
      </SelectableEntry>
    </li>
  );
}
