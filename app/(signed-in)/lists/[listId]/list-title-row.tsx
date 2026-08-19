import Link from "next/link";

import { Poster } from "@/app/poster";
import type { ListDetailTitleRow } from "@/db/access";

/**
 * One row of a list, in order — issue #147's *ordered rows with a small poster, not a
 * poster grid*, because position is the point of a list and a grid does not show one.
 *
 * ── The number is on screen, not implied by array order ───────────────────────────────
 *
 * `title.position` is rendered directly rather than derived from where the row falls in
 * the list this component is mapped over — the acceptance criterion is *each row's
 * position is visible*, a fact about the glass, and `db/access.ts`'s `getListDetail`
 * already orders by it, so this is the one number that must be printed rather than
 * assumed to match the array index (which it always will, but a reader cannot see an
 * array index).
 *
 * ── Every row is a link; which page it links to is the ownership question ─────────────
 *
 * A list holds anything in the catalogue (issue #133), so a row is a title this account
 * has added or one it has not, and issue #148 gives the second case a page of its own.
 * An owned row links to `library/[entryId]` — your copy, with your progress on it. An
 * unowned row links to `titles/[kind]/[tmdbId]`, which is the same borrowed facts with no
 * owned fact anywhere on it and one *Add to library*. Two destinations rather than two
 * kinds of row: what differs is the key each page is keyed by, and that difference is the
 * whole of how the read stays scoped (`db/access.ts`'s `getUnownedTitleDetail`).
 *
 * Through #147 this branch rendered a row with nothing to press, because the destination
 * did not exist yet. It exists now, and a listed title you have not started is one tap
 * from being one you have.
 *
 * Both are a plain `Link`, not `SelectableEntry`
 * (`library/selectable-entry.tsx`): that component reads `useLibrarySelection()`, whose
 * provider only wraps `library-surface.tsx` — the desktop pane exists on `/library` and
 * nowhere else. A list has no pane of its own, so every row here is a real navigation on
 * both devices, the same shape the phone route already uses for title detail.
 */
export function ListTitleRow({ title }: { readonly title: ListDetailTitleRow }) {
  const meta = metaLine(title);

  const content = (
    <>
      <span className="code-line w-8 shrink-0 text-dim" data-numeric>
        {title.position}
      </span>

      <Poster posterPath={title.posterPath} width={56} className="w-14 shrink-0" />

      <div className="min-w-0 flex-1">
        <h2 className="bill-title text-bill-md text-text">{title.name}</h2>
        {meta === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {meta}
          </p>
        )}
      </div>
    </>
  );

  return (
    <li className="border-b border-hair">
      <Link
        href={
          title.libraryEntryId === null
            ? `/titles/${title.kind}/${title.tmdbId}`
            : `/library/${title.libraryEntryId}`
        }
        className="flex items-center gap-4 py-3 transition-colors duration-150 hover:bg-raised"
      >
        {content}
      </Link>
    </li>
  );
}

function metaLine(title: ListDetailTitleRow): string | null {
  const parts: string[] = [];
  if (title.releaseYear !== null) parts.push(String(title.releaseYear));
  parts.push(title.kind === "film" ? "Film" : "Show");
  return parts.join(" · ");
}
