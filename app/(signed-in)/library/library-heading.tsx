/**
 * The bill's head — one heading on one hairline, and (now that #57 has arrived) the filter
 * chips, the filter-by-typing field and the sort select alongside it.
 *
 * `DESIGN.md` and the reference build draw all four in one `flex flex-wrap` row so that on
 * a narrow phone the controls wrap under the heading rather than opening a second bordered
 * bar underneath it. `children` is that row's remainder: empty when there is nothing to
 * filter, `LibraryBar`'s chips/field/select when there is.
 *
 * The heading is `text-bill-sm`, which is the step `DESIGN.md`'s type table names for *The
 * library* by name. It is smaller than the Search screen's `text-bill-lg`, and that is the
 * right way round: Search is a page you read, and this is a section head over the thing
 * you actually came to look at.
 *
 * It is shared by three callers — the populated screen, the genuinely empty one, and the
 * failure boundary — so that a failed read is visibly *the library, which did not load*
 * rather than a bare error on a blank page, and so the three cannot drift apart. Only the
 * populated caller passes `children`: `SPEC.md` §9 forbids reserving space for controls
 * that have nothing to act on, which is exactly what the genuinely empty library and a
 * failed read both are.
 */

/** The heading's id, so the grid can point `aria-labelledby` at it. */
export const LIBRARY_HEADING_ID = "library-heading";

export function LibraryHeading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule px-6 py-4">
      <h1 id={LIBRARY_HEADING_ID} className="bill-title text-bill-sm text-stock">
        The library
      </h1>

      {children}
    </div>
  );
}
