import type { LibraryEntryRow } from "@/db/access";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import { posterGlowStyle } from "@/app/poster-tint";
import { CheckmarkIcon } from "./checkmark-icon";
import { STATE_LABELS } from "./library-state";
import { SelectableEntry } from "./selectable-entry";
import { SelectionCheckBadge } from "./selection-check-badge";

/**
 * One programme entry — the bill's grid cell, and the only thing 472 of them are made of.
 *
 * ── What it was, and what turn 9 made it ─────────────────────────────────────────────
 *
 * Components described this cell as *a full-width button, **not a card**.
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
 * The plate went to a poster in #135 (`app/poster.tsx`); the register was rewritten from
 * the built world in #144, and now records this reversal among the rest.
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
 * An abandoned title's poster drops to `opacity: .5` and its name drops to `--dim`; that
 * pairing is the only place the poster is modified. Both halves are here and nowhere else
 * — one without the other reads as a rendering fault rather than as a state.
 *
 * `.5` since Charcoal (handoff §6: *Dropped draws the poster at 50%*), down from turn 9's
 * `.55`.
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
 * **The state line is back** — Charcoal, handoff §8.4 and issue #402. Under the name, at
 * `12px` in `--dim`: *S1 E2 up next* for a show being watched, otherwise the state's own
 * word from `STATE_LABELS`. Turn 9 took the word off the card because it repeated the
 * filter a reader was inside; the boards put it back, and the owner chose the numbered
 * form for the watching line over the old *never numbered alone* rule (issue #402).
 *
 * **Two overlays, and only two** — issue #357. A title being watched carries the bar; a
 * finished one carries a filled tick in the top-left corner (handoff §6); every other
 * state carries nothing. The bar used to be drawn for every state with progress, which
 * put a full bar on every finished show and a stub on every watchlist one.
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
 * was one of the five fixed measures before #135. It is fixed at every
 * breakpoint: the column count is what changes between a phone and a desktop, and nothing
 * else is. Height is not set — the `poster` utility's `2/3` aspect ratio
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
        poster={
          <>
            {/* The glow's wrapper (issue #363) — on a plain element of this server
                component, so the cell gains no client boundary; `.poster` already spends
                its own `box-shadow` on the plate line. It carries the poster's radius so
                the glow is the poster's shape. */}
            <div
              className={
                entry.posterColour === null
                  ? undefined
                  : "poster-glow [--poster-radius:var(--radius-4)]"
              }
              style={posterGlowStyle(entry.posterColour)}
            >
              <Poster
                posterPath={entry.posterPath}
                name={entry.name}
                width={BILL_POSTER_WIDTH}
                className={abandoned ? `${BILL_POSTER} opacity-50` : BILL_POSTER}
                aboveFold={aboveFold}
              >
                {/* On the artwork, not under the name — `poster-progress-bar.tsx` has the
                    argument. An abandoned title's bar dims with the poster it is inside,
                    which is the pairing this cell has always drawn. */}
                {entry.state === "watching" ? (
                  <PosterProgressBar progress={entry.progress} />
                ) : null}
                {entry.state === "finished" ? (
                  <span
                    aria-label="Finished"
                    role="img"
                    className="absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-[var(--radius-full)] bg-text text-ground"
                  >
                    <CheckmarkIcon className="h-3 w-3" />
                  </span>
                ) : null}
              </Poster>
            </div>
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
          className={`mt-1.5 line-clamp-2 break-words text-item leading-tight font-medium ${abandoned ? "text-dim" : "text-text"}`}
        >
          {entry.name}
        </p>
        <p className="mt-0.5 truncate text-label text-dim" data-numeric>
          {stateLine(entry)}
        </p>
      </SelectableEntry>
    </li>
  );
}

/** The line under the name — *S1 E2 up next* while watching, else the state's own word. */
export function stateLine(entry: Pick<LibraryEntryRow, "state" | "upNext">): string {
  if (entry.state === "watching" && entry.upNext !== null) {
    return `S${entry.upNext.seasonNo} E${entry.upNext.episodeNo} up next`;
  }
  return STATE_LABELS[entry.state].label;
}
