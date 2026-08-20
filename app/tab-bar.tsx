"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { smooth } from "./motion";
import { LibraryIcon, ListsIcon, SearchIcon, UpNextIcon } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";

/**
 * The phone tab bar — issue #102, closing `SPEC.md` §10.3's temporary-deviation bullet,
 * and widened to four by issue #146. `DESIGN.md`, Navigation: *fixed tabs at the bottom
 * on a `1px` gap over `hair`, with a `hair` top border. Each tab is a rectilinear icon
 * over a label. Active is inverted to bone/ink. Lands on Up next.*
 *
 * ── Frosted, since issue #136 ─────────────────────────────────────────────────────────
 *
 * That ticket's own acceptance criteria: *content passes under the chrome rather than
 * stopping at it* — the same `bg-ground/95 backdrop-blur-[2px]` recipe `masthead.tsx`
 * already carries, reused rather than re-tuned so the two pieces of fixed phone chrome
 * read as one frosted family. The inactive cells gave up their opaque `bg-ground` for
 * exactly this: an opaque cell over translucent siblings would leave two-thirds of the
 * bar with nothing to see through it, which is what that ticket's Glass section calls
 * *the glass having nothing to do*. `divide-x divide-hair` draws the same three
 * hairlines the old `gap-px bg-hair` trick did, without needing an opaque ground to draw
 * them against. The active cell keeps its solid `bg-text` inversion — `DESIGN.md`'s
 * Elevation section still names inversion the strongest emphasis this system has, and
 * issue #136 only asked the *chrome* to go translucent, not the current-tab treatment.
 *
 * ── Why this is a client component ───────────────────────────────────────────────────
 *
 * Only for `usePathname`, the same reason `sidebar-nav.tsx` is one — the desktop
 * counterpart issue #136 built. `isCurrentRoute` (`nav-route.ts`) is shared between the
 * two rather than kept as two copies of the same `startsWith` check: *Search* and
 * *Library* are about to carry pushed routes under them (title detail, catalogue
 * results), and a reader three screens deep is still in that section. *Up next* has no
 * routes under it, but the pattern costs nothing to apply uniformly.
 *
 * ── `divide-x divide-hair`, not borders between cells ────────────────────────────────
 *
 * `DESIGN.md`'s Hairline Rule: structure is drawn, not spaced. This used to draw its three
 * dividers with a `1px` gap over a `hair`-coloured ground (`gap-px bg-hair`) the way the
 * old desktop TONIGHT row's clipped grid did — that trick needs an opaque ground to show
 * the gap against, which stopped being true the moment the container went translucent for
 * issue #136. `divide-x divide-hair` draws the same three lines as borders instead, which
 * cost nothing when the cell behind them is transparent. The container's own top edge is
 * still the one place a `hair` border belongs — Elevation & Depth names *"the phone tab
 * bar's top edge"* as that rule's own worked example.
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

/** `54px`: `py-2` (`16px`) plus a `16px` icon, a `4px` gap and a `16px` code line
 *  (`0.75rem` at its own `1.35` line-height), plus the `2px` `hair` top border —
 *  `16 + 16 + 4 + 16 + 2 = 54`, and measured against the rendered bar to confirm it,
 *  not taken on faith. Hand-summed here because two other files
 *  (`(signed-in)/layout.tsx`, `errors/write-failure-toast.tsx`) have to reserve or match
 *  it exactly, and a Tailwind arbitrary value repeated three times with no shared source
 *  is the kind of number that drifts the moment one of the three changes.
 *
 *  It rose from `49px` when the code line lost its caps and went from `0.625rem`/`1.1`
 *  to `0.75rem`/`1.35`. That is precisely the drift the paragraph above predicts, and
 *  the constant is why it cost one edit rather than three: both dependent files read
 *  this number and neither needed touching. */
export const TAB_BAR_HEIGHT_PX = 54;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 divide-x divide-hair border-t-2 border-hair bg-ground/95 backdrop-blur-[2px] lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrentRoute(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "relative flex flex-col items-center justify-center gap-1 py-2 text-ground"
                : "relative flex flex-col items-center justify-center gap-1 py-2 text-dim transition-colors duration-[var(--dur-fast)] hover:text-text"
            }
          >
            {/* The inversion used to be `bg-text` on the active cell, which meant it
                appeared in the new cell and disappeared from the old one in the same
                frame — the reader's eye had to re-find the selection rather than being
                carried to it. As a `layoutId` it is one element that Motion moves
                between cells, so the block travels the width of a tab.

                It sits *under* the contents (`inset-0`, with `z-10` on the icon and
                label) rather than wrapping them, because a shared-layout element cannot
                also be the flex parent of the thing it animates past. */}
            {current ? (
              <motion.span
                layoutId="tab-bar-active"
                className="absolute inset-0 bg-text"
                transition={smooth}
              />
            ) : null}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="code-line relative z-10">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
