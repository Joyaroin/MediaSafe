import type { LibraryEntryRow, LibraryState } from "@/db/access";
import { Poster } from "@/app/poster";
import { STATE_LABELS } from "./library-state";
import { SelectableEntry } from "./selectable-entry";

/**
 * One programme entry — the bill's grid cell, and the only thing 472 of them are made of.
 *
 * `DESIGN.md`, Components: *a full-width button, not a card. Ground `ground`, hairline right
 * and bottom borders, `1rem` padding, `1rem` gap. Left: the plate at `78×104px`. Right:
 * the title in lightly-condensed 700 at `1.45rem`, a dim code line, the state label, and a single
 * truncated line of what's next. Hover fills the cell with `raised`. No shadow, no
 * lift, no radius, no scale.* Every class below is that sentence, taken from the reference
 * build (`docs/design/prototypes/repertory-bill.html:344`) rather than re-derived — except
 * the plate itself, which #135 replaces with a poster: `78px` wide survives, the fixed
 * `104px` height and the "no radius" do not (`app/poster.tsx`). `DESIGN.md` is rewritten
 * from the built world in #144, not before.
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
 * An abandoned title's poster drops to `opacity: .45` and its name drops to dim bone;
 * that pairing is the only place the poster is modified. Both halves are here and nowhere
 * else — one without the other reads as a rendering fault rather than as a state.
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
const BILL_POSTER_WIDTH = 66;
const BILL_POSTER = "w-[66px] shrink-0 [--poster-radius:10px]";

/**
 * The one line of what is next, for each of the five states this cell renders. The label
 * and its colour are `library-state.ts`'s `STATE_LABELS` — shared with the programme note
 * (issue #58) — because a *tile*'s "what's next" line has no equivalent there, where the
 * season/episode list is the answer to the same question at full length.
 *
 * ── The lines ────────────────────────────────────────────────────────────────────────
 *
 * Two rules shape the wording, and neither is cosmetic:
 *
 *  - **An episode is never referred to by number alone** (`CONTEXT.md`, and
 *    `docs/design/v1-surfaces.md` §4 makes it a hard rule *with no degrading surface*).
 *    So an unnamed next episode says that it is unnamed. It does not fall back to `S2 E4`,
 *    which is the fallback `tvtracker` had no choice about — its `NextEpisode` type
 *    carried no name at all.
 *  - ***Caught up* and *finished* are not the same sentence.** `CONTEXT.md` glosses caught
 *    up as *"nothing to watch now; something to watch later"* and finished as a show that
 *    has ended or a film you have watched. Giving them one line would erase the only
 *    distinction between them that a reader of this grid can see.
 *
 * Every line is a function of the entry, including the four that ignore it, so that the
 * table has one shape rather than a special case for the one state that reads a column.
 */
const NEXT_LINES: Record<LibraryState, (entry: LibraryEntryRow) => string> = {
  watching: (entry) => {
    if (entry.upNext === null) {
      /**
       * Watching, with nothing after your progress. Reachable by skipping forward —
       * progress is a high-water mark, so an unwatched earlier episode keeps the state
       * at *watching* while `library_entry_up_next` has nothing later to point at.
       */
      return "Nothing listed after your progress";
    }
    return entry.upNext.episodeName === null
      ? "Next episode not named yet"
      : `Next — ${entry.upNext.episodeName}`;
  },
  caught_up: () => "Nothing to watch now",
  finished: () => "Nothing left to watch",
  watchlist: () => "Not started",
  // `CONTEXT.md`: *watching the title again clears it.* The line says how to undo the
  // one state you set by hand, because this cell is where you meet it again.
  abandoned: () => "Watching it again clears this",
};

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
  const nextLine = NEXT_LINES[entry.state];

  return (
    <li className="overflow-hidden rounded-[18px] bg-raised">
      <SelectableEntry
        entryId={entry.libraryEntryId}
        className="pressable flex w-full gap-3.5 p-3.5 text-left"
      >
        {/* `.55`, not the `.45` this used to carry. The handoff sets abandoned tiles at
            `.55` on the Up next groups and then names this cell as the one place that
            already dims a poster, with the instruction not to leave the two different by
            accident. Both are `.55` now: the linen ground is lighter than the bone one
            this number was chosen against, so the same title reads as further gone at the
            same opacity, and `.55` is the redesign's value for the state on both
            surfaces. */}
        <Poster
          posterPath={entry.posterPath}
          width={BILL_POSTER_WIDTH}
          className={abandoned ? `${BILL_POSTER} opacity-55` : BILL_POSTER}
          aboveFold={aboveFold}
        />

        <div className="min-w-0 flex-1">
          {/*
            `break-words` is not decoration. A title is one flex child beside a poster of
            fixed width, and a long word — `ENGAGEMENT`, `Neighbourhood`, most of a German
            title — cannot wrap, so without this it pushes past the cell and the whole
            page gains a horizontal scrollbar at phone widths. Measured at 388px before it
            was added: 552px of content in a 388px viewport.
          */}
          <p
            className={`break-words text-row font-semibold leading-tight tracking-[-0.014em] ${abandoned ? "text-dim" : "text-ink"}`}
          >
            {entry.name}
          </p>

          {/*
            `DESIGN.md` draws this line as `2022 · FX` — a year and a network. **The
            network half has no source.** ADR-0001's mirror is `kind`, `tmdb_id`, `name`,
            `release_year`, `poster_path`, `in_production` and `runtime_mins`; there is no
            network column on `title` and nothing in `tmdb/mirror.ts` produces one. So the
            line is the year alone rather than a year beside an invented string, and
            printing the network needs a column, a mirror change and a migration — a
            ticket, not a line here.

            A title TMDB has not dated gets no line at all rather than a placeholder,
            for the reason `app/poster.tsx` gives for artwork it does not have: a missing
            borrowed fact is not an error and an apology is the wrong shape for it.
          */}
          {entry.releaseYear === null ? null : (
            <p className="mt-1 text-meta leading-[1.3] text-dim" data-numeric>
              {entry.releaseYear}
            </p>
          )}

          <p className={`label-line mt-2.5 ${state.className}`}>{state.label}</p>

          {/*
            One line, and it truncates rather than wrapping: two cells whose titles are
            one and two lines long already sit at different heights, and a next-episode
            name that wraps would add a third variation to a grid whose whole job is to
            read as one printed sheet.
          */}
          <p className="mt-1 truncate text-item leading-[1.3] text-dim">
            {nextLine(entry)}
          </p>
        </div>
      </SelectableEntry>
    </li>
  );
}
