import Link from "next/link";

import { Poster } from "@/app/poster";
import type { ListDetailTitleRow } from "@/db/access";

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
 * `SPEC.md` §9: *no count may appear as chrome on a surface the reader came to do
 * something else on* — no size on a head, no badge, no *showing 10 of 62*. The numeral on
 * each poster is not that. It is the **hand order**, which `SPEC.md` names as the defining
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
}: {
  readonly titles: readonly ListDetailTitleRow[];
}) {
  return (
    /* `library-grid.tsx`'s own columns and gutter, not a second grid: a list of titles and
       a library of titles are the same content at the same sizes, and the day one of them
       gains a breakpoint the other should have it. The `14px` gutter is that file's own
       reasoning — the cell's padding is inside the card, so a `14px` list gutter is what
       puts a poster's *edge* on the page's `22px`. */
    <ol className="stagger-rise grid grid-cols-3 gap-x-3.5 gap-y-5 px-[14px] pb-6 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {titles.map((title, index) => (
        <IconCell key={title.titleId} title={title} aboveFold={index < FIRST_ROW} />
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
}: {
  readonly title: ListDetailTitleRow;
  readonly aboveFold: boolean;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={
          title.libraryEntryId === null
            ? `/catalogue/${title.kind}/${title.tmdbId}`
            : `/titles/${title.libraryEntryId}`
        }
        className="pressable group block"
      >
        {/* `relative` is the numeral's, which hangs off the poster's own corner rather
            than the cell's — the same placement `SelectionCheckBadge` takes on a library
            cell, and for its reason: the cell's corner is a gutter away from anything. */}
        <div className="relative">
          <Poster
            posterPath={title.posterPath}
            name={title.name}
            width={POSTER_WIDTH}
            className="w-full transition duration-150 group-hover:brightness-110 [--poster-radius:10px]"
            aboveFold={aboveFold}
          />

          {/* `--ink` on the poster, not the accent: this is the order the reader set, and
              `app/globals.css` gives the accent three roles, none of which is *a fact
              about where something sits in a list*. `tab-bar.tsx` made the same call for
              the same reason. */}
          <span
            className="code-line absolute top-1.5 left-1.5 min-w-5 rounded-full bg-ink px-1.5 py-0.5 text-center text-ground"
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
    </li>
  );
}
