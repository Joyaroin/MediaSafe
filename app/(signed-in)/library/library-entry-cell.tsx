import type { LibraryEntryRow, LibraryState } from "@/db/access";
import { Plate } from "@/app/plate";

/**
 * One programme entry — the bill's grid cell, and the only thing 472 of them are made of.
 *
 * `DESIGN.md`, Components: *a full-width button, not a card. Ground `ink`, hairline right
 * and bottom borders, `1rem` padding, `1rem` gap. Left: the plate at `78×104px`. Right:
 * the title in condensed 900 at `2.15rem`, a dim code line, the state label, and a single
 * truncated line of what's next. Hover fills the cell with `ink-raised`. No shadow, no
 * lift, no radius, no scale.* Every class below is that sentence, taken from the reference
 * build (`docs/design/prototypes/repertory-bill.html:344`) rather than re-derived.
 *
 * ── The button does not go anywhere yet ──────────────────────────────────────────────
 *
 * Pressing it does nothing, and that is issue #56's edge: the destination is the programme
 * note, which is **issue #58**, blocked by this one. The element is a `button` rather than
 * a `div` because that is what #56's acceptance criteria specify and because it is what
 * #58 attaches to — the diff there is a handler, not a rewrite of the cell.
 *
 * It is the one thing in this ticket that reads as working before it does, and the
 * masthead's *Library* cell was withheld for exactly that reason until this route existed.
 * The difference is that a nav item that goes nowhere is a **destination** that does not
 * exist, and this is a surface that does: the entry, its state and what is next are all on
 * screen and all true. Nothing is being reserved and nothing is being promised.
 *
 * ── Abandoned is the only modified plate ─────────────────────────────────────────────
 *
 * `DESIGN.md`, The Plate: *an abandoned title's plate drops to `opacity: .45` and its name
 * drops to dim bone; that pairing is the only place the plate is modified.* Both halves
 * are here and nowhere else — one without the other reads as a rendering fault rather
 * than as a state.
 */

/**
 * The plate's measure in the bill grid — `78×104px`, one of `DESIGN.md`'s five fixed
 * measures. It is a fixed number of pixels at every breakpoint: the column count is what
 * changes between a phone and a desktop, and nothing else is (`SPEC.md` §7).
 */
const BILL_PLATE = "h-[104px] w-[78px] shrink-0";

/**
 * The five states as this cell renders them: what each is called, what colour the label is
 * set in, and the one line of what is next. **One table, because there is one thing to
 * know about a state** — a second lookup keyed by the same union is two places to edit
 * when a sixth state or a reworded line arrives, and one of them gets missed.
 *
 * ── The labels ───────────────────────────────────────────────────────────────────────
 *
 * `CONTEXT.md`'s words and no others. *Watching* is the only one in `signal` and *caught
 * up* the only one at full-strength `stock` — `DESIGN.md`'s Colour table gives vermilion
 * to the live state and bone to *Caught up* by name. The other three are metadata, so they
 * are dim.
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
const STATES: Record<
  LibraryState,
  { label: string; className: string; nextLine: (entry: LibraryEntryRow) => string }
> = {
  watching: {
    label: "Watching",
    className: "text-signal",
    nextLine: (entry) => {
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
  },
  caught_up: {
    label: "Caught up",
    className: "text-stock",
    nextLine: () => "Nothing to watch now",
  },
  finished: {
    label: "Finished",
    className: "text-stock-dim",
    nextLine: () => "Nothing left to watch",
  },
  watchlist: {
    label: "Watchlist",
    className: "text-stock-dim",
    nextLine: () => "Not started",
  },
  abandoned: {
    label: "Abandoned",
    className: "text-stock-dim",
    // `CONTEXT.md`: *watching the title again clears it.* The line says how to undo the
    // one state you set by hand, because this cell is where you meet it again.
    nextLine: () => "Watching it again clears this",
  },
};

export function LibraryEntryCell({ entry }: { entry: LibraryEntryRow }) {
  const abandoned = entry.state === "abandoned";
  const state = STATES[entry.state];

  return (
    <li className="border-b border-r border-rule bg-ink">
      <button
        type="button"
        className="flex w-full gap-4 p-4 text-left transition-colors duration-150 hover:bg-ink-raised"
      >
        <Plate
          posterPath={entry.posterPath}
          className={abandoned ? `${BILL_PLATE} opacity-45` : BILL_PLATE}
        />

        <div className="min-w-0 flex-1">
          {/*
            `break-words` is not decoration. A title is one flex child beside a plate of
            fixed width, and a long word — `ENGAGEMENT`, `Neighbourhood`, most of a German
            title — cannot wrap, so without this it pushes past the cell and the whole
            page gains a horizontal scrollbar at phone widths. Measured at 388px before it
            was added: 552px of content in a 388px viewport.
          */}
          <p
            className={`bill-title break-words text-bill-md ${abandoned ? "text-stock-dim" : "text-stock"}`}
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
            for the reason `app/plate.tsx` gives for artwork it does not have: a missing
            borrowed fact is not an error and an apology is the wrong shape for it.
          */}
          {entry.releaseYear === null ? null : (
            <p className="code-line mt-2 text-stock-dim" data-numeric>
              {entry.releaseYear}
            </p>
          )}

          <p className={`code-line mt-3 ${state.className}`}>{state.label}</p>

          {/*
            One line, and it truncates rather than wrapping: two cells whose titles are
            one and two lines long already sit at different heights, and a next-episode
            name that wraps would add a third variation to a grid whose whole job is to
            read as one printed sheet.
          */}
          <p className="mt-1 truncate text-item text-stock-dim">
            {state.nextLine(entry)}
          </p>
        </div>
      </button>
    </li>
  );
}
