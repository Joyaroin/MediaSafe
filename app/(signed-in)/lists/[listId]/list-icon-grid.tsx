import Link from "next/link";

import { PosterLink } from "@/app/(signed-in)/library/poster-link";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import type { ListDetailTitleRow } from "@/db/access";

/** The cell's link, owned or not — one press register for both. */
const CELL_LINK = "pressable group block";

/**
 * A custom list in **icon view** — Finder's, and named after it because it is the same
 * idea and a third word for it would help nobody.
 *
 * ── Why this is the default and the rows are the alternate ────────────────────────────
 *
 * A list is a small set of titles a reader chose by hand, and what tells one from another
 * is the artwork. The row view spends most of a wide screen on whitespace beside a `56px`
 * poster; four columns of `2/3` artwork is the same eleven titles legible at a glance.
 *
 * ── The numeral, and why it is not the count rule's problem ────────────────────────────
 *
 * The rule: *no count may appear as chrome on a surface the reader came to do
 * something else on* — no size on a head, no badge, no *showing 10 of 62*. The numeral on
 * each poster is not that. It is the **hand order**, the defining
 * property of a list (*ordered by hand*), and the row view has always printed it in its
 * own leading cell. A number is allowed where the number is part of the content, and
 * *which one did I put third* is content here in exactly the way *am I three from the end
 * of this show* is on an Up next row.
 *
 * It matters more in this view than in the rows, not less: a grid reads left-to-right and
 * wraps, so without it the order a reader set by hand is a thing they have to reconstruct
 * from the layout.
 *
 * ── Reordering is not here, and that is this pass's stated limit ──────────────────────
 *
 * `reorderable-title-list.tsx`'s drag is one-dimensional — pointer `translateY` against a
 * column of measured row heights — and its keyboard fallback is `ArrowUp`/`ArrowDown`. A
 * grid makes both two-dimensional, which is a different interaction and its own ticket. So
 * this view is view-only and the **List** tab is where a list is reordered, which is the
 * bargain Finder strikes too: you cannot drag a file into place in a sorted list view
 * there either. The numerals are what keep the order legible without switching.
 */
export function ListIconGrid({
  titles,
  onTakeOff,
}: {
  readonly titles: readonly ListDetailTitleRow[];
  /** Take a title off the list — `take-off.ts`. */
  readonly onTakeOff: (title: ListDetailTitleRow) => void;
}) {
  return (
    /* `library-grid.tsx`'s own columns and gutter, not a second grid: a list of titles and
       a library of titles are the same content at the same sizes, and the day one of them
       gains a breakpoint the other should have it. The `14px` gutter is that file's own
       reasoning — the cell's padding is inside the card, so a `14px` list gutter is what
       puts a poster's *edge* on the page's `22px`. */
    <ol className="stagger-rise grid grid-cols-3 gap-x-3.5 gap-y-5 px-[14px] pb-6 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {titles.map((title, index) => (
        <IconCell
          key={title.titleId}
          title={title}
          aboveFold={index < FIRST_ROW}
          onTakeOff={() => onTakeOff(title)}
        />
      ))}
    </ol>
  );
}

/** Two rows of the widest column count, which is what a first paint can be asked for
 *  without guessing at the viewport. `library-grid.tsx`'s own number and reasoning. */
const FIRST_ROW = 12;

/** The poster's rendered width at the narrowest column this grid draws — what `Poster`
 *  resolves to a TMDB bucket, and what its missing-artwork initials scale off. */
const POSTER_WIDTH = 132;

function IconCell({
  title,
  aboveFold,
  onTakeOff,
}: {
  readonly title: ListDetailTitleRow;
  readonly aboveFold: boolean;
  readonly onTakeOff: () => void;
}) {
  return (
    <li className="relative min-w-0">
      {/* A sibling of the link, not inside it, so the press takes the title off rather than
          opening it. */}
      <button
        type="button"
        onClick={onTakeOff}
        aria-label={`Take ${title.name} off this list`}
        className="absolute top-1 right-1 z-10 flex h-9 w-9 items-center justify-center rounded-[var(--radius-full)] bg-ground/80 text-dim transition-colors duration-[var(--dur-fast)] hover:text-danger"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {title.libraryEntryId === null ? (
        <Link
          href={`/catalogue/${title.kind}/${title.tmdbId}`}
          className={CELL_LINK}
        >
        {/* `relative` is the numeral's, which hangs off the poster's own corner rather
            than the cell's — the same placement `SelectionCheckBadge` takes on a library
            cell, and for its reason: the cell's corner is a gutter away from anything. */}
        <div
          className="relative"
        >
          <Poster
            posterPath={title.posterPath}
            name={title.name}
            width={POSTER_WIDTH}
            className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-4)]"
            aboveFold={aboveFold}
          >
            {/* The same bar the bill draws, on the same edge of the same poster — a list
                is the library's titles in a hand order, and how far through one you are
                does not change with the surface you meet it on. `null` for a title this
                account does not own, which is a case the bill never has to draw
                (`db/access.ts`'s `ListDetailTitleRow.progress`). */}
            <PosterProgressBar progress={title.progress} />
          </Poster>

          {/* `--ink` on the poster, not the accent: this is the order the reader set, and
              `app/globals.css` gives the accent three roles, none of which is *a fact
              about where something sits in a list*. `tab-bar.tsx` made the same call for
              the same reason. */}
          <span
            className="code-line absolute top-1.5 left-1.5 min-w-5 rounded-[var(--radius-full)] bg-text px-1.5 py-0.5 text-center text-ground"
            data-numeric
          >
            {title.position}
          </span>
        </div>

        {/* `break-words` for `library-entry-cell.tsx`'s measured reason: a long unbroken
            word — most of a German title — cannot wrap inside a grid column, and without
            this it pushes the column open and the page gains a horizontal scrollbar. */}
        <p className="mt-2 line-clamp-2 break-words text-item leading-snug text-text">
          {title.name}
        </p>

        {/* No line at all for a title TMDB has not dated, rather than a placeholder — the
            same choice `library-entry-cell.tsx` makes for the identical fact. The kind is
            dropped from the meta line the rows print: a poster at `2/3` beside a name is
            already saying which of the two this is, and *Film* under every cell of a list
            of films is a word repeated eleven times. */}
        {title.releaseYear === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {title.releaseYear}
          </p>
        )}
        </Link>
      ) : (
        <PosterLink
          libraryEntryId={title.libraryEntryId}
          posterPath={title.posterPath}
          className={CELL_LINK}
        >
        {/* `relative` is the numeral's, which hangs off the poster's own corner rather
            than the cell's — the same placement `SelectionCheckBadge` takes on a library
            cell, and for its reason: the cell's corner is a gutter away from anything. */}
        <div
          className="relative"
        >
          <Poster
            posterPath={title.posterPath}
            name={title.name}
            width={POSTER_WIDTH}
            className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-4)]"
            aboveFold={aboveFold}
          >
            {/* The same bar the bill draws, on the same edge of the same poster — a list
                is the library's titles in a hand order, and how far through one you are
                does not change with the surface you meet it on. `null` for a title this
                account does not own, which is a case the bill never has to draw
                (`db/access.ts`'s `ListDetailTitleRow.progress`). */}
            <PosterProgressBar progress={title.progress} />
          </Poster>

          {/* `--ink` on the poster, not the accent: this is the order the reader set, and
              `app/globals.css` gives the accent three roles, none of which is *a fact
              about where something sits in a list*. `tab-bar.tsx` made the same call for
              the same reason. */}
          <span
            className="code-line absolute top-1.5 left-1.5 min-w-5 rounded-[var(--radius-full)] bg-text px-1.5 py-0.5 text-center text-ground"
            data-numeric
          >
            {title.position}
          </span>
        </div>

        {/* `break-words` for `library-entry-cell.tsx`'s measured reason: a long unbroken
            word — most of a German title — cannot wrap inside a grid column, and without
            this it pushes the column open and the page gains a horizontal scrollbar. */}
        <p className="mt-2 line-clamp-2 break-words text-item leading-snug text-text">
          {title.name}
        </p>

        {/* No line at all for a title TMDB has not dated, rather than a placeholder — the
            same choice `library-entry-cell.tsx` makes for the identical fact. The kind is
            dropped from the meta line the rows print: a poster at `2/3` beside a name is
            already saying which of the two this is, and *Film* under every cell of a list
            of films is a word repeated eleven times. */}
        {title.releaseYear === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {title.releaseYear}
          </p>
        )}
        </PosterLink>
      )}
    </li>
  );
}
