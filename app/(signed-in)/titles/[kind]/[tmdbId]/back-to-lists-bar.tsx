import Link from "next/link";

/**
 * The one piece this route's three renders all have above the fold — issue #181, the same
 * move `library/[entryId]/back-to-library-bar.tsx` made for #180. `page.tsx` and
 * `error.tsx` were already drawing this bar twice, character for character; `loading.tsx`
 * would have been the third paste.
 *
 * Unlike `lists/[listId]`'s bar, this route's `<h1>` sits below the poster rather than in
 * this bar, so there is no `children` slot here to carry it — the bar is the whole of what
 * every render shares.
 */
export function BackToListsBar() {
  return (
    <div className="border-b border-hair px-6 py-4">
      <Link
        href="/lists"
        className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text"
      >
        ‹ Lists
      </Link>
    </div>
  );
}
