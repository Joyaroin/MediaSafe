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

import type { DestinationHref } from "./destinations";

/** A play mark — the same triangle vocabulary as the sort select's caret
 *  (`library-filter-bar.tsx`), the one other polygon in the build. Continuing a title is
 *  what this icon is for. */
/** The icon each of the four destinations carries, in both navigations. */
export const DESTINATION_ICONS: Record<
  DestinationHref,
  (props: { className?: string }) => React.ReactElement
> = {
  "/up-next": UpNextIcon,
  "/library": LibraryIcon,
  "/search": SearchIcon,
  "/you": YouIcon,
};

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
 * A head over a pair of shoulders — issue #249's own drawing, and the sixth in this file.
 *
 * It replaces `StatsIcon`, the three rising columns #227 drew, at both call sites at once:
 * `/stats` is gone, and the phone's fourth tab and the sidebar's fifth primary row both
 * lead to You now. The bars went with the page rather than being kept for a destination
 * that no longer reports anything — an icon with no route behind it is a forbidden
 * placeholder, one glyph smaller.
 *
 * **A square head, not a round one**, which is the whole design problem here. Every avatar
 * mark in the world is a circle over an arc, and a circle would be the second curve in an
 * application whose one rule about glyphs is that *a magnifier would be the only curve in
 * it*. So the head is a square and the shoulders are a wider rectangle beneath it —
 * `LibraryIcon`'s cells and `SettingsIcon`'s rules are the same vocabulary, and the shape
 * still reads as a person because the proportion does the work the curve usually does.
 *
 * The gap between the two is `4` units at this viewBox, wide enough to survive being drawn
 * at `19px` on the tab bar and `16px` in the sidebar without the two shapes fusing into one
 * blob — the failure that would make this glyph unreadable at exactly the two sizes it is
 * ever drawn at.
 */
export function YouIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="8" y="2" width="8" height="8" fill="currentColor" />
      <rect x="3" y="14" width="18" height="8" fill="currentColor" />
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
