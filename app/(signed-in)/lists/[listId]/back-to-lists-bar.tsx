import Link from "next/link";

/**
 * The one piece this route's three renders all have above the fold — issue #181, and the
 * same move `library/[entryId]/back-to-library-bar.tsx` made for #180. `page.tsx` and
 * `error.tsx` were already drawing this bar twice, character for character; `loading.tsx`
 * would have been the third paste, so the bar moves here before there are three.
 *
 * `children` is the list's own `<h1>{detail.name}</h1>` — `LibraryHeading`'s own shape,
 * for the same reason: `DESIGN.md` §9 spells out what *the page's own heading component*
 * means for a route whose `<h1>` is itself the answer — whatever the segment's `error.tsx`
 * renders above the failure, which here is this bar with nothing passed to it. Only
 * `page.tsx` has a name to pass; `error.tsx` and `loading.tsx` render the bar bare, because
 * a name that failed to load cannot be printed and a name still being read is not yet
 * known.
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
