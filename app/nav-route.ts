/**
 * Whether a destination counts as current for a given pathname — `tab-bar.tsx` and
 * `sidebar-nav.tsx` both need this and disagreed with each other in nothing but the
 * variable names before this existed, which is the kind of drift that survives one edit
 * to either file forgetting the other.
 *
 * `startsWith`, not equality: *Library* and *Search* carry pushed and replaced routes
 * under them (title detail, catalogue results), and a reader three screens into either is
 * still in that section. `sidebar-nav.tsx` extends the same rule to *Settings*, for
 * `/settings/delete-account`.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
