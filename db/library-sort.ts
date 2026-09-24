/**
 * The library's sort vocabulary — a URL value and a label, nothing that reads or writes a
 * row. Split out of `db/access.ts` on purpose: that file's own header names the shape
 * every export there follows — *"reads or writes owned rows"*, *"every exported function
 * takes the user id as its first argument"* — and none of that is true of picking an
 * `ORDER BY` from four fixed options. `orderByFor` (`db/access.ts`) still builds the
 * actual `SQL`, because only that file may touch `drizzle-orm` at all
 * (`eslint.config.mjs`'s choke point) — this file only names the four choices.
 */

/**
 * The four fixed orders (#22), in the order the sort select lists
 * them — **Title A–Z is the default and carries no query-string value of its own**, so a
 * reader who never touches the control keeps a clean `/library`.
 *
 * The value is what `?sort=` carries, so it is written once here rather than translated
 * between a URL vocabulary and a query vocabulary that could drift apart.
 */
export const LIBRARY_SORTS = [
  { value: "title", label: "Title A–Z" },
  { value: "closest-to-finishing", label: "Closest to finishing" },
  { value: "recently-added", label: "Recently added" },
  { value: "release-year", label: "Release year, newest first" },
] as const;

export type LibrarySort = (typeof LIBRARY_SORTS)[number]["value"];

export const DEFAULT_LIBRARY_SORT: LibrarySort = "title";

/**
 * `?sort=` off a URL a reader typed, bookmarked, or navigated back to — not a value this
 * codebase produced, so an unrecognised one is ordinary navigation noise and not a bug to
 * throw on. That is the opposite call from `db/access.ts`'s `stateFrom`: a state the view
 * did not define means that file and the database have gone out of step, and the honest
 * answer is a failure. A stale or hand-edited `sort` just means falling back to the
 * default order.
 */
export function sortFrom(value: string | readonly string[] | undefined): LibrarySort {
  const candidate = typeof value === "string" ? value : undefined;
  const known = LIBRARY_SORTS.find((sort) => sort.value === candidate);
  return known ? known.value : DEFAULT_LIBRARY_SORT;
}
