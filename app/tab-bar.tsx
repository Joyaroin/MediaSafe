"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { DESTINATIONS } from "./destinations";
import { DESTINATION_ICONS } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";
import { PHONE_BAR, SELECTING_ATTRIBUTE } from "./phone-bar";
import { useUpNextRepress } from "./use-up-next-repress";

/**
 * The phone tab bar — issue #102, closing a temporary-deviation bullet,
 * widened to four by issue #146, redrawn by the linen redesign's turn 9, and widened to
 * five by Charcoal (issue #399): Tonight, Coming up, Search, Library, You.
 *
 * ── What turn 9 changed, and what it took away ────────────────────────────────────────
 *
 * The Navigation register used to read *fixed tabs at the bottom on a `1px` gap
 * over `hair`, with a `hair` top border. Each tab is a rectilinear icon over a label.
 * Active is inverted to bone/ink.* Two of those four sentences are gone:
 *
 * - **No dividers between cells.** `divide-x divide-hair` drew three hairlines down the
 *   bar. Turn 9 draws none: four labelled cells in a row do not need ruling apart, and on
 *   a ground this warm the lines were the loudest thing in the chrome.
 * - **No inverted active cell**, and with it no travelling `layoutId` block. The active
 *   tab is now its icon and label in `text` against inactive `dim` — a weight
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
 * ── `text` for the active tab ───────────────────────────────────────────────────────
 *
 * The linen handoff drew this cell in vermilion and named the alternative in the same
 * breath — the full-strength neutral — because an accent on the one piece of chrome that is
 * on every screen is wallpaper, and wallpaper cannot also be a signal. Charcoal settles it
 * for good: there is no accent hue, and the active tab is `text` against `dim` siblings.
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
 * to do. The four stayed four — the tab budget is unchanged and no fifth was
 * ever added.
 *
 * **Issue #249 spends it on You, and this time the page behind it is gone.** `/stats` is
 * deleted outright: the direction #245 set asks for the six figures You reports rather than
 * the nine Stats reported, so the destination is not demoted or folded in, it stops
 * existing. A tab is a way to a page and lasts exactly as long as it is the way — the same
 * sentence that let Stats have this slot is what takes it back.
 *
 * The desktop sidebar made the same substitution in its own column and kept Lists as
 * well. That asymmetry was #227's; the UI overhaul ended it by driving both from
 * `destinations.ts`.
 *
 * **Issue #399 adds the fifth, which #227 said was never added.** Coming up was the second
 * page of a pager inside the first tab; Charcoal retired the pager and gave it a tab, so a
 * screen reached by a swipe nobody could see is now one labelled cell on the bar.
 *
 * **The Lists routes are still untouched**, as they have been since #227. `/lists` and
 * `/lists/[listId]` exist, the rail leads to them, the sidebar links to them, and a deep
 * link into either works. What #227 retired was a tab; what #249 retires is a page.
 */
const TABS = DESTINATIONS.map(({ href, label }) => ({
  href,
  label,
  Icon: DESTINATION_ICONS[href],
}));

/**
 * The bar used to derive a direction here — forward or back by position in `TABS` — and
 * attach it as a transition type. It does not any more: the three transition vocabularies
 * collapsed into one motion, so every navigation animates identically and there is no
 * direction for this file to decide.
 *
 * The reasoning is in `globals.css` beside the animation, recorded
 * as the reversal it is. What was right about the old rule and is worth keeping in mind if
 * anyone rebuilds it: direction came from the bar's own geometry rather than from history,
 * because the row in front of the reader is the only thing that makes "forward" mean
 * anything — a history-based direction would have called *You → Up next* forward whenever
 * it happened to be a new entry.
 */
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
 * it keeps is what a finger gets. `hover:text-text` still applies, instantly.
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

/**
 * ── `inert` carries the accessibility guarantee now — issue #334 ─────────────────────
 *
 * Until this ticket `app/globals.css` took this bar out of the layout with a single
 * `display: none` the instant `data-selecting` appeared, so *gone from layout* and *gone
 * from the accessibility tree* were the same event. This bar now crosses with the action
 * bar instead of cutting — `app/globals.css`'s `.phone-tab-bar` rules fade and rise it,
 * with `display` itself deferred to the *end* of that fade by `allow-discrete` — so for the
 * length of the fade this bar is visible, in flow, and would otherwise still be four
 * `Link`s a screen reader's own navigation can reach under the reader's thumb.
 *
 * So the guarantee moves here, off the same attribute the CSS reacts to rather than off
 * `display`: a `MutationObserver` on `document.documentElement`'s `data-selecting` sets
 * `inert` on the `<nav>` directly, synchronously with the attribute write and therefore
 * before the browser has painted a single frame of the transition — not at the end of it,
 * which is what reading `display` instead would have given back. Imperative and off the
 * DOM rather than a second `useState` and a re-render: the property that has to land
 * "the instant selection becomes active" is not one to route through a commit that might
 * land a frame late.
 *
 * A `MutationObserver` rather than reaching into `bulk-selection-context.ts` for the same
 * reason `selection-action-bar.tsx`'s own docblock gives for writing the attribute in the
 * first place: there is no component above both this bar and the Library's selection
 * provider that has any other reason to know either exists, and threading the state up
 * would create one.
 */
export function TabBar() {
  const pathname = usePathname();
  const onUpNextLinkClick = useUpNextRepress();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = navRef.current;
    if (element === null) return;

    function sync(): void {
      element!.inert = document.documentElement.hasAttribute(SELECTING_ATTRIBUTE);
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [SELECTING_ATTRIBUTE],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      // `viewTransitionName` takes this bar out of the `root` snapshot so it can be held
      // still while the content slides underneath it — see `globals.css`. The name is a
      // plain string rather than a token because it is an identity, not a measure.
      style={{ viewTransitionName: "phone-tab-bar" }}
      // `phone-tab-bar` carries no styling of its own — it is the handle
      // `app/globals.css` takes this bar out of the layout by while the Library is in
      // selection mode (issue #197), fading and rising it since #334 rather than cutting
      // it — see this component's own docblock for the `inert` guarantee that used to
      // ride on `display` alone.
      //
      // `PHONE_BAR` is the frosting, the hairline and the four numbers that add up to
      // `--tab-bar-height`, shared with the bar that replaces this one (`app/phone-bar.ts`).
      // The five-column grid is this bar's own and stays here.
      className={`phone-tab-bar ${PHONE_BAR} grid grid-cols-5`}
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrentRoute(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            // Only Tonight (`/up-next`) carries a handler at all — issue #323's one
            // gesture. Every other tab's `<Link>` is exactly what it was before this
            // ticket.
            onClick={href === "/up-next" ? onUpNextLinkClick : undefined}
            className={`${TAB} ${current ? "text-text" : "text-dim hover:text-text"}`}
          >
            {/* `data-nav-icon` is where a finished row's poster lands, and what nods as it
                does (`poster-flight.ts`, issue #407) — a wrapper, so the nod's scale never
                meets the press's on the icon itself. */}
            <span data-nav-icon={href} className="flex">
              <Icon className={TAB_ICON} />
            </span>
            <span className={TAB_LABEL}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
