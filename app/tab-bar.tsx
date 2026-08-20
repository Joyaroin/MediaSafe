"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LibraryIcon, ListsIcon, SearchIcon, UpNextIcon } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";

/**
 * The phone tab bar — issue #102, closing `SPEC.md` §10.3's temporary-deviation bullet,
 * widened to four by issue #146, and redrawn by the linen redesign's turn 9.
 *
 * ── What turn 9 changed, and what it took away ────────────────────────────────────────
 *
 * `DESIGN.md`'s Navigation section used to read *fixed tabs at the bottom on a `1px` gap
 * over `hair`, with a `hair` top border. Each tab is a rectilinear icon over a label.
 * Active is inverted to bone/ink.* Two of those four sentences are gone:
 *
 * - **No dividers between cells.** `divide-x divide-hair` drew three hairlines down the
 *   bar. Turn 9 draws none: four labelled cells in a row do not need ruling apart, and on
 *   a ground this warm the lines were the loudest thing in the chrome.
 * - **No inverted active cell**, and with it no travelling `layoutId` block. The active
 *   tab is now its icon and label in `--ink` against inactive `--dim` — a weight
 *   difference rather than a filled rectangle. Motion's shared-layout element went with
 *   the inversion because there is no longer a ground for it to move: it animated the
 *   *block*, and the block is what turn 9 removed. The library chips keep theirs, where
 *   there is still a filled pill to travel.
 *
 * The top border drops from `2px` to `1px` — the redesign has one hairline weight — and
 * the frosting is turn 9's own recipe rather than `masthead.tsx`'s: `78%` of the ground
 * under a `22px` blur, against the `95%`/`2px` the two pieces of chrome used to share.
 * The masthead carries the same pair now, so they still read as one family; what changed
 * is that the family is genuinely translucent rather than nearly opaque.
 *
 * ── `--ink` for the active tab, and not the accent ───────────────────────────────────
 *
 * The handoff draws this cell in vermilion and then names the alternative in the same
 * breath — *this spends the accent on selection, which `globals.css` currently reserves
 * for recording a watch. If that reservation must hold, use `--ink` for the active tab
 * instead — the design still reads correctly.* It must, and this does.
 *
 * The tab bar is the only chrome on all four screens, so an accent here is the single
 * spend that is never off-screen — and the thing it would compete with is two centimetres
 * above it, because the library cell paints its **Watching** label in the same vermilion.
 * A signal that is always present is wallpaper, and wallpaper cannot also be a signal.
 * Turn 9's own closing note reaches the same place: *"vermilion only for Watching, not
 * the tabs"*. `globals.css` states the resulting rule in full.
 *
 * ── Why this is a client component ───────────────────────────────────────────────────
 *
 * Only for `usePathname`, the same reason `sidebar-nav.tsx` is one — the desktop
 * counterpart issue #136 built. `isCurrentRoute` (`nav-route.ts`) is shared between the
 * two rather than kept as two copies of the same `startsWith` check: *Search* and
 * *Library* carry pushed routes under them (title detail, catalogue results), and a
 * reader three screens deep is still in that section.
 *
 * ── Fixed, and what that costs every screen beneath it ───────────────────────────────
 *
 * `position: fixed` means this bar is not in flow, so every phone screen it sits over
 * must reserve its height at the foot of the page or the bar covers real content. That
 * height is `--tab-bar-height` in `globals.css` — `44 + 8 + 22 + 1 = 75px` — and it is
 * declared there rather than here because the two files that reserve it
 * (`(signed-in)/layout.tsx`, `errors/write-failure-toast.tsx`) each do so inside a
 * Tailwind class, which cannot read a TypeScript constant. The `TAB_BAR_HEIGHT_PX`
 * export that used to live in this file was exactly that mistake: nothing imported it,
 * it said `54`, and both dependents had drifted to `49`.
 */
const TABS = [
  { href: "/up-next", label: "Up next", Icon: UpNextIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/lists", label: "Lists", Icon: ListsIcon },
] as const;

/**
 * Which way along the bar a tap moves the reader, as a transition type the CSS can act on
 * (`globals.css`, *Moving between the four phone tabs*).
 *
 * Derived from the two tabs' **positions in `TABS`**, not from history: the bar is a
 * horizontal row of four and the direction that means anything here is the one the reader
 * can see in front of them. A history-based direction would call *Lists → Up next*
 * "forward" whenever it happened to be a new entry, which is the opposite of what the row
 * shows.
 *
 * A tap on the current tab returns `[]` — no type, so no animation. Next's `Link` still
 * navigates, and a screen sliding out and back in to arrive where it already was is the
 * clearest case of motion that means nothing.
 */
function tabTransitionTypes(pathname: string, href: string): string[] {
  const from = TABS.findIndex((tab) => isCurrentRoute(pathname, tab.href));
  const to = TABS.findIndex((tab) => tab.href === href);

  // `-1` is a route under none of the four — a title detail pushed from elsewhere. There
  // is no position to compare against, so there is no direction to claim.
  if (from === -1 || from === to) return [];
  return to > from ? ["tab-forward"] : ["tab-back"];
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      // `viewTransitionName` takes this bar out of the `root` snapshot so it can be held
      // still while the content slides underneath it — see `globals.css`. The name is a
      // plain string rather than a token because it is an identity, not a measure.
      style={{ viewTransitionName: "phone-tab-bar" }}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hair frosted pt-2 pb-[22px] lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrentRoute(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            transitionTypes={tabTransitionTypes(pathname, href)}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "flex h-11 flex-col items-center justify-center gap-1 text-ink"
                : "flex h-11 flex-col items-center justify-center gap-1 text-dim transition-colors duration-[var(--dur-fast)] hover:text-ink"
            }
          >
            <Icon className="h-[19px] w-[19px]" />
            <span className="text-tab font-medium leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
