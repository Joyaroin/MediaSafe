/**
 * The four glyphs the app's navigation draws with — one rectilinear vocabulary shared by
 * every surface that lists a destination, rather than a set redrawn per surface.
 *
 * `tab-bar.tsx` minted the first three for the phone tab bar (issue #102); `sidebar.tsx`
 * (issue #136) is the second caller, and the reason they moved here — a sidebar with the
 * same four destinations drawing its own copies is exactly the kind of drift that leaves a
 * product with two play marks that quietly stop agreeing. `SettingsIcon` is `masthead.tsx`'s
 * original inline drawing, extracted for the same reason: the sidebar's own Settings entry
 * needed it, and inlining a second copy was the alternative this file exists to avoid.
 */

/** A play mark — the same triangle vocabulary as the sort select's caret
 *  (`library-filter-bar.tsx`), the one other polygon in the build. Continuing a title is
 *  what this icon is for. */
export function UpNextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon points="6,3 21,12 6,21" fill="currentColor" />
    </svg>
  );
}

/** The same tapering bars `search-surface.tsx` and `library-filter-bar.tsx` already draw
 *  next to their filter fields — *"the same rectilinear vocabulary as the press mark, a
 *  magnifier would be the only curve in the application."* Reused rather than
 *  re-invented, so the product has one search glyph, not two. */
export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="2.5" fill="currentColor" />
      <rect x="5" y="10.75" width="14" height="2.5" fill="currentColor" />
      <rect x="9" y="16.5" width="6" height="2.5" fill="currentColor" />
    </svg>
  );
}

/** A four-cell grid — the bill in miniature. */
export function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" fill="currentColor" />
      <rect x="13" y="2" width="9" height="9" fill="currentColor" />
      <rect x="2" y="13" width="9" height="9" fill="currentColor" />
      <rect x="13" y="13" width="9" height="9" fill="currentColor" />
    </svg>
  );
}

/** Three struck rules with sliders on them — the same rectilinear vocabulary as the press
 *  mark, and the same drawing `masthead.tsx` used inline before this file existed. */
export function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="2" fill="currentColor" />
      <rect x="14" y="2" width="3.5" height="8" fill="currentColor" />
      <rect x="2" y="12" width="20" height="2" fill="currentColor" />
      <rect x="6" y="9" width="3.5" height="8" fill="currentColor" />
      <rect x="2" y="19" width="20" height="2" fill="currentColor" />
      <rect x="16" y="16" width="3.5" height="8" fill="currentColor" />
    </svg>
  );
}
