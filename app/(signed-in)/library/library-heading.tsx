/**
 * The bill's head — one heading on one hairline, and nothing else.
 *
 * `DESIGN.md` and the reference build draw this bar carrying the filter chips, the
 * filter-by-typing field and the sort select alongside the heading. **None of them is in
 * this ticket** and no space is left for them: `SPEC.md` §9 is *ship none of these, and
 * reserve no space for them — no empty rails, no placeholder tabs, no "coming soon"*, and
 * issue #56 repeats it. They arrive together in #57, and the bar grows then.
 *
 * The heading is `text-bill-sm`, which is the step `DESIGN.md`'s type table names for *The
 * library* by name. It is smaller than the Search screen's `text-bill-lg`, and that is the
 * right way round: Search is a page you read, and this is a section head over the thing
 * you actually came to look at.
 *
 * It is shared by the screen and by its failure boundary so that a failed read is visibly
 * *the library, which did not load* rather than a bare error on a blank page — and so the
 * two cannot drift apart.
 */

/** The heading's id, so the grid can point `aria-labelledby` at it. */
export const LIBRARY_HEADING_ID = "library-heading";

export function LibraryHeading() {
  return (
    <div className="border-b border-rule px-6 py-4">
      <h1 id={LIBRARY_HEADING_ID} className="bill-title text-bill-sm text-stock">
        The library
      </h1>
    </div>
  );
}
