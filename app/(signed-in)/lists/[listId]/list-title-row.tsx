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
 * ── Linked only when this account owns it ─────────────────────────────────────────────
 *
 * A list holds anything in the catalogue (issue #133), and there is no title-detail page
 * yet for a title nobody owns — issue #148 is still open. So a row for a title this
 * account has not added renders the same borrowed facts with nothing to press; once #148
 * ships, the `libraryEntryId === null` branch is the one line that changes.
 *
 * This is a plain `Link` to `library/[entryId]`, not `SelectableEntry`
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

  if (title.libraryEntryId === null) {
    return (
      <li className="flex items-center gap-4 border-b border-hair py-3">{content}</li>
    );
  }

  return (
    <li className="border-b border-hair">
      <Link
        href={`/library/${title.libraryEntryId}`}
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
