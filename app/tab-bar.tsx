"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The phone tab bar — issue #102, closing `SPEC.md` §10.3's temporary-deviation bullet,
 * and widened to four by issue #146. `DESIGN.md`, Navigation: *fixed tabs at the bottom
 * on a `1px` gap over `rule`, with a `rule-bold` top border. Each tab is a rectilinear
 * icon over a label. Active is inverted to bone/ink. Lands on Up next.*
 *
 * ── Why this is a client component ───────────────────────────────────────────────────
 *
 * Only for `usePathname`, the same reason `nav-cells.tsx` is one — the masthead's desktop
 * counterpart. `startsWith`, not equality, for *Search* and *Library* for the same reason
 * given there: both are about to carry pushed routes under them (title detail, catalogue
 * results), and a reader three screens deep is still in that section. *Up next* has no
 * routes under it, but the pattern costs nothing to apply uniformly.
 *
 * ── `gap-px bg-rule`, not borders between cells ──────────────────────────────────────
 *
 * `DESIGN.md`'s Hairline Rule: structure is drawn by a `1px` gap over a `rule`-coloured
 * ground, the same device `up-next-row.tsx`'s clipped grid uses. The container's own top
 * edge is the one place a `rule-bold` border belongs — Elevation & Depth names *"the phone
 * tab bar's top edge"* as that rule's own worked example.
 *
 * ── Fixed, and what that costs every screen beneath it ───────────────────────────────
 *
 * `position: fixed` means this bar is not in flow, so every phone screen it sits over
 * must reserve its height at the foot of the page or the bar covers real content —
 * `(signed-in)/layout.tsx` reserves `TAB_BAR_HEIGHT_PX` there, below `lg:`, and
 * `errors/write-failure-toast.tsx`'s phone toast is lifted by the same number: that file's
 * own comment named this ticket as the one that owes it the height.
 *
 * It never crowds the recording control for a structural reason, not a measured one: the
 * control (`up-next-dominant-card.tsx`) sits in normal document flow at the foot of the
 * dominant card's block, with the compact deck continuing beneath it — this bar only ever
 * overlaps the page's trailing whitespace, which is exactly what the reserved padding
 * turns into clearance.
 */
const TABS = [
  { href: "/up-next", label: "Up next", Icon: UpNextIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/lists", label: "Lists", Icon: ListsIcon },
] as const;

/** `49px`: `py-2` (`16px`) plus a `16px` icon, a `4px` gap and an `11px` code line
 *  (`0.625rem` at its own `1.1` line-height), plus the `2px` `rule-bold` top border —
 *  `16 + 16 + 4 + 11 + 2 = 49`, and measured against the rendered bar to confirm it,
 *  not taken on faith. Hand-summed here because two other files
 *  (`(signed-in)/layout.tsx`, `errors/write-failure-toast.tsx`) have to reserve or match
 *  it exactly, and a Tailwind arbitrary value repeated three times with no shared source
 *  is the kind of number that drifts the moment one of the three changes. */
export const TAB_BAR_HEIGHT_PX = 49;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-px border-t-2 border-rule-bold bg-rule lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "flex flex-col items-center justify-center gap-1 bg-stock py-2 text-ink"
                : "flex flex-col items-center justify-center gap-1 bg-ink py-2 text-stock-dim"
            }
          >
            <Icon className="h-4 w-4" />
            <span className="code-line">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** A play mark — the same triangle vocabulary as the sort select's caret
 *  (`library-filter-bar.tsx`), the one other polygon in the build. Continuing a title is
 *  what this tab is for. */
function UpNextIcon({ className }: { className?: string }) {
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
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="2.5" fill="currentColor" />
      <rect x="5" y="10.75" width="14" height="2.5" fill="currentColor" />
      <rect x="9" y="16.5" width="6" height="2.5" fill="currentColor" />
    </svg>
  );
}

/** A four-cell grid — the bill in miniature. */
function LibraryIcon({ className }: { className?: string }) {
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
function ListsIcon({ className }: { className?: string }) {
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
