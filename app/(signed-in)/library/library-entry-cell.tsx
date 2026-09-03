import type { LibraryEntryRow } from "@/db/access";
import { Poster } from "@/app/poster";
import { libraryProgressFraction } from "./library-progress-fraction";
import { railPosterTransitionName } from "./poster-transition-name";
import { STATE_LABELS } from "./library-state";
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
 * ── The bar at the foot, since issue #324 ────────────────────────────────────────────
 *
 * A show's card gains a thin bar under the state line, filled by
 * `libraryProgressFraction` (watched against released — never against every mirrored
 * episode, which `library-progress-fraction.ts`'s own docblock explains is a different
 * question `progress-remaining.ts`'s `watchProgress` answers instead, on title detail).
 * `null` draws nothing, which is both a film (no `progress` at all — `db/access.ts`) and
 * a show with nothing released yet (`progress.released === 0`): two different reasons for
 * the same absence, and neither reads as *started and empty*.
 *
 * **Not the accent.** `DESIGN.md` §0 rations it to one live thing per screen, and the
 * grid already spends it on the *Watching* label (`STATE_LABELS`, `LIVE_EDGE_OF_THE_
 * RECORD`) — a bar on every card regardless of state would be 472 chances to spend a
 * token reserved for one. `bg-dim` on `bg-hair`, the same quiet pairing `STATE_LABELS`
 * already uses for every state that is not *Watching*.
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
const BILL_POSTER = "w-full [--poster-radius:10px]";

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
  const state = STATE_LABELS[entry.state];
  const progress =
    entry.progress === null
      ? null
      : libraryProgressFraction(entry.progress.watched, entry.progress.released);

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
            />
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
          third line would push the state label of one cell out of step with its
          neighbours' across the whole grid.
        */}
        <p
          className={`mt-2 line-clamp-2 break-words text-item leading-snug font-medium ${abandoned ? "text-dim" : "text-ink"}`}
        >
          {entry.name}
        </p>

        {/*
          **The state, and it is the one line that survived the re-layout.**
          
          The cell used to carry three lines under the name — the year, the state, and what
          is next (`Next — Winter Is Coming`, `Nothing to watch now`). A column has room for
          one, and this is it: the library is the surface organised *by* state, its filter
          chips are the six states, and it is the fact a reader is scanning for.

          The year went because the poster identifies the title and the title's own page
          carries it. The next-episode line went to Up next, which since the rails became
          lists is a full-width row with room to print the episode's actual name rather
          than one truncated clause — the two surfaces stopped duplicating each other.
          `NEXT_LINES` is deleted with it; nothing else read those strings.
        */}
        <p className={`label-line mt-1.5 ${state.className}`}>{state.label}</p>

        {progress === null ? null : (
          <div
            aria-hidden="true"
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hair"
          >
            <div
              className="h-full rounded-full bg-dim"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </SelectableEntry>
    </li>
  );
}
