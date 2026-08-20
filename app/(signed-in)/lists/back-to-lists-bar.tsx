import Link from "next/link";

/**
 * The `‹ Lists` bar — shared by two route trees, not one, since a #181 code-review pass
 * caught the two as a near-verbatim paste of each other. `lists/[listId]`'s `page.tsx` and
 * `error.tsx` were already drawing it twice, character for character; `loading.tsx` would
 * have been the third paste there, and `titles/[kind]/[tmdbId]`'s own three renders were
 * about to become three more of the same markup rather than a second thing entirely — the
 * href, the copy and the underline are identical because a list is the only thing that
 * links to either route.
 *
 * It lives at `lists/`'s own root rather than inside `[listId]/`, the same shape
 * `library/add-to-list-control.tsx` and `library/live-title-facts.tsx` already take when
 * `titles/[kind]/[tmdbId]/page.tsx` imports them: a surface's shared pieces sit at its own
 * root, not nested inside one of its dynamic children, so a second route reaching for one
 * is reaching into the surface it belongs to and not into an unrelated sibling segment.
 *
 * `children` is `lists/[listId]`'s own `<h1>{detail.name}</h1>` — `LibraryHeading`'s own
 * shape, for the same reason: `DESIGN.md` §9 spells out what *the page's own heading
 * component* means for a route whose `<h1>` is itself the answer — whatever the segment's
 * `error.tsx` renders above the failure, which here is this bar with nothing passed to it.
 * `titles/[kind]/[tmdbId]` never passes children at all: its own `<h1>` sits below the
 * poster rather than in this bar, so it has nothing to hand this slot.
 */
export function BackToListsBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="border-b border-hair px-6 py-4">
      <Link
        href="/lists"
        className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text"
      >
        ‹ Lists
      </Link>

      {children}
    </div>
  );
}
