/**
 * The six glyphs the app's navigation draws with — one rectilinear vocabulary shared by
 * every surface that lists a destination, rather than a set redrawn per surface.
 *
 * `tab-bar.tsx` minted the first three for the phone tab bar (issue #102); `sidebar.tsx`
 * (issue #136) is the second caller, and the reason they moved here — a sidebar with the
 * same destinations drawing its own copies is exactly the kind of drift that leaves a
 * product with two play marks that quietly stop agreeing. `SettingsIcon` is `masthead.tsx`'s
 * original inline drawing, extracted for the same reason: the sidebar's own Settings entry
 * needed it, and inlining a second copy was the alternative this file exists to avoid.
 * `ListsIcon` is issue #146's own drawing, moved here from `tab-bar.tsx` when #136's merge
 * gave the sidebar a fourth primary destination to match — the icon is unchanged, only its
 * address.
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

/** Three bulleted rows — a grouping made by hand, not the poster grid `LibraryIcon` draws
 *  or the tapering search bars: a list is ranked rows, and this is that shape in miniature
 *  (issue #146). */
export function ListsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="3" width="3" height="3" fill="currentColor" />
      <rect x="8" y="3" width="14" height="3" fill="currentColor" />
      <rect x="2" y="10.5" width="3" height="3" fill="currentColor" />
      <rect x="8" y="10.5" width="14" height="3" fill="currentColor" />
      <rect x="2" y="18" width="3" height="3" fill="currentColor" />
      <rect x="8" y="18" width="14" height="3" fill="currentColor" />
    </svg>
  );
}

/**
 * Three columns of rising height — issue #227's own drawing, and the sixth in this file.
 *
 * It is bars rather than a curve for the reason the header gives: *a magnifier would be the
 * only curve in the application*, and a line chart's glyph would be the second. Three
 * rectangles sharing a baseline are the same vocabulary `SearchIcon` and `ListsIcon` are
 * drawn in, and they say *a comparison of quantities* without borrowing a shape from a
 * chart this ticket does not ship.
 */
export function StatsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="14" width="5" height="8" fill="currentColor" />
      <rect x="9.5" y="8" width="5" height="14" fill="currentColor" />
      <rect x="17" y="2" width="5" height="20" fill="currentColor" />
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
