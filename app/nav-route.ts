/**
 * Whether a destination counts as current for a given pathname — `tab-bar.tsx` and
 * `sidebar-nav.tsx` both need this and disagreed with each other in nothing but the
 * variable names before this existed, which is the kind of drift that survives one edit
 * to either file forgetting the other.
 *
 * `startsWith`, not equality: a destination can carry pushed and replaced routes under it,
 * and a reader inside one of those is still in that section. `sidebar-nav.tsx` extends the
 * same rule to *Settings*, for `/settings/delete-account`.
 *
 * **The example it was written for is gone.** Title detail sat at `/library/{entryId}`, so
 * this matched it to the Library tab and a reader on a title counted as being on the bar.
 * #290 moved it to `/titles/{entryId}` — a title the reader holds is not a Library page —
 * and nothing is nested under a tab's href there, so a reader on a detail screen now counts
 * as being off the bar. `tab-bar.tsx`'s `navTransitionTypes` is where that is felt.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
