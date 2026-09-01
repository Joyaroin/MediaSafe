"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LibraryIcon, SearchIcon, UpNextIcon, YouIcon } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";
import { PHONE_BAR } from "./phone-bar";

/**
 * The phone tab bar — issue #102, closing `SPEC.md` §10.3's temporary-deviation bullet,
 * widened to four by issue #146, and redrawn by the linen redesign's turn 9 (`docs/design/prototypes/mediasafe-phone-up-next.html`).
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
/**
 * ── The fourth tab has changed hands twice, and this is where both happened ──────────
 *
 * **Issue #227 spent it on Stats.** Lists stopped being a tab on the phone: #223 had put a
 * rail of every list above the Library grid, so the phone already reached every list in one
 * tap from a tab it lands on anyway, and the tab that used to do that job had nothing left
 * to do. The four stayed four — `SPEC.md` §9's tab budget is unchanged and no fifth was
 * ever added.
 *
 * **Issue #249 spends it on You, and this time the page behind it is gone.** `/stats` is
 * deleted outright: the direction #245 set asks for the six figures You reports rather than
 * the nine Stats reported, so the destination is not demoted or folded in, it stops
 * existing. A tab is a way to a page and lasts exactly as long as it is the way — the same
 * sentence that let Stats have this slot is what takes it back.
 *
 * The desktop sidebar makes the same substitution in its own column and keeps Lists as
 * well, because it has the room: `sidebar-nav.tsx` runs six destinations where this runs
 * four. That asymmetry is #227's and is untouched here.
 *
 * **The Lists routes are still untouched**, as they have been since #227. `/lists` and
 * `/lists/[listId]` exist, the rail leads to them, the sidebar links to them, and a deep
 * link into either works. What #227 retired was a tab; what #249 retires is a page.
 */
const TABS = [
  { href: "/up-next", label: "Up next", Icon: UpNextIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/you", label: "You", Icon: YouIcon },
] as const;

/**
 * Which way a tap moves the reader, as a transition type the CSS can act on
 * (`globals.css`, *Moving between the phone's screens*).
 *
 * Derived from the two tabs' **positions in `TABS`**, not from history: the bar is a
 * horizontal row of four and the direction that means anything here is the one the reader
 * can see in front of them. A history-based direction would call *You → Up next* "forward"
 * whenever it happened to be a new entry, which is the opposite of what the row shows.
 *
 * Three cases, and the third is the one that keeps Settings symmetrical:
 *
 * - **Same tab** — no type, so no animation. A screen sliding out and back in to arrive
 *   where it already was is the clearest case of motion that means nothing.
 * - **Another tab** — forward or back by position in the row.
 * - **Not on a tab at all** (`from === -1`) — the reader is on a screen pushed *outside*
 *   the four, which today means Settings, `/import`, `/welcome`, and — since #227 retired
 *   its tab — `/lists` and a list's own screen. Tapping a tab from there is coming back
 *   out to the tab level, so it is `nav-back` — the mirror of the `nav-forward`
 *   `masthead.tsx` attaches on the way in. That is the right treatment for the Lists
 *   screens too: the rail that leads to them is *on* the Library tab, so a reader
 *   returning to the row is coming back out of something they went into.
 *
 *   This case used to return `[]`, which made Settings the one screen you slid *into* and
 *   then jumped out of with nothing. **A title detail joined this case in #290**, and it
 *   is worth saying so rather than leaving it to be rediscovered: it used to be excluded,
 *   because `isCurrentRoute` matched `/library/{id}` to the Library tab and a reader three
 *   screens deep was still on one. Detail lives at `/titles/{entryId}` now, which is under
 *   no tab, so tapping a tab from a title reads as coming back out of something the reader
 *   went into — the same treatment the Lists screens get, and for the same reason.
 */
function navTransitionTypes(pathname: string, href: string): string[] {
  const from = TABS.findIndex((tab) => isCurrentRoute(pathname, tab.href));
  const to = TABS.findIndex((tab) => tab.href === href);

  if (from === to) return [];
  if (from === -1) return ["nav-back"];
  return to > from ? ["nav-forward"] : ["nav-back"];
}

/**
 * ── The bar wears the press — issue #295 ─────────────────────────────────────────────
 *
 * One class string, worn by all four tabs. Until this ticket these were the four most
 * pressed controls in the application and the only ones that answered nothing: #279's
 * press reached every tile, cell, row and button in the tree, and of the `pressable` call
 * sites the bar that is on screen at all times was not one.
 *
 * **The control register, which is a register that already exists.** A tab is a 44px hit
 * box, the same kind of thing as the search screen's add — not a 262px card — so it takes
 * `--press-register: 1` and none of #279's numbers move. The register is spelled as an
 * arbitrary property the way every other classified call site spells it
 * (`globals.css`'s `@utility pressable`, and `tests/press-spring.test.ts` sweeps for it).
 *
 * **One string and not one per state.** The active and inactive branches differ by colour
 * alone, so the press lives in the shared half. Four tabs pressing is then a property of
 * the single `<Link>` below rather than of four class attributes staying in step.
 *
 * **The colour transition is gone from this element, and that is forced rather than
 * chosen.** `pressable` declares `transition`, and `transition-colors` declares
 * `transition`; two of them on one element in the `utilities` cascade layer make *which
 * one wins* a question about the order Tailwind emits them in — and the losing branch is
 * either a hover tint that no longer fades or a compression that no longer eases, which
 * is the press broken outright. This bar is `lg:hidden`, so the tint it drops is a hover
 * fade on a surface that only exists where there is no pointer to hover with; the press
 * it keeps is what a finger gets. `hover:text-ink` still applies, instantly.
 */
const TAB = "pressable [--press-register:1] flex h-11 flex-col items-center justify-center gap-1";

/**
 * **The icon leads the label.** `press-lead` (`app/globals.css`) compresses the element
 * that wears it a little further than the press it sits inside — `0.920 × 0.98 = 0.9016`
 * here against the label's `0.920` — so a tab answers as an icon over a word rather than
 * as one flat block. Without it the four cells compress uniformly and the bar reads as a
 * search row that happens to have tabs in it.
 *
 * It is a class token and nothing else: no state, no handler, and the press's one
 * delegated listener (`motion-provider.tsx`) is still the whole of this bar's runtime.
 */
const TAB_ICON = "press-lead h-[19px] w-[19px]";

/** The label takes the tab's own compression and no more — the second half of the lead
 *  being a lead at all. */
const TAB_LABEL = "text-tab font-medium leading-tight";

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      // `viewTransitionName` takes this bar out of the `root` snapshot so it can be held
      // still while the content slides underneath it — see `globals.css`. The name is a
      // plain string rather than a token because it is an identity, not a measure.
      style={{ viewTransitionName: "phone-tab-bar" }}
      // `phone-tab-bar` carries no styling of its own — it is the handle
      // `app/globals.css` takes this bar out of the layout by while the Library is in
      // selection mode (issue #197), and the reason that rule can be written without any
      // state reaching this component from a grid three routes down.
      //
      // `PHONE_BAR` is the frosting, the hairline and the four numbers that add up to
      // `--tab-bar-height`, shared with the bar that replaces this one (`app/phone-bar.ts`).
      // The four-column grid is this bar's own and stays here.
      className={`phone-tab-bar ${PHONE_BAR} grid grid-cols-4`}
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrentRoute(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            transitionTypes={navTransitionTypes(pathname, href)}
            aria-current={current ? "page" : undefined}
            className={`${TAB} ${current ? "text-ink" : "text-dim hover:text-ink"}`}
          >
            <Icon className={TAB_ICON} />
            <span className={TAB_LABEL}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
