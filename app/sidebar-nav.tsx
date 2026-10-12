"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { smooth } from "./motion";
import { SELECTED, SELECTED_MARKER, UNSELECTED } from "./selection";
import { DESTINATIONS } from "./destinations";
import { DESTINATION_ICONS } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";
import { useUpNextRepress } from "./use-up-next-repress";

/**
 * The sidebar's destinations, and the one thing about them that needs the browser —
 * issue #136, merged against issue #146 rather than after it. `sidebar.tsx` renders the
 * wordmark and the display name around this; this is only the part that has to know which
 * route the reader is on.
 *
 * ── Lists, arriving already built ────────────────────────────────────────────────────
 *
 * #146 shipped *Lists* onto the masthead's nav cells and the phone tab bar while this
 * sidebar did not exist yet, saying explicitly that whatever #132's eventual sidebar did
 * would inherit the destination rather than re-decide it. It is the fourth
 * item in `PRIMARY` for that reason — not a fresh design decision made here, but the one
 * #146 already made, carried into the nav that finally exists to carry it.
 *
 * ── No accent, on purpose ─────────────────────────────────────────────────────────────
 *
 * **Charcoal (issue #397) replaced the left rule below with the outlined item** — every
 * selection in the app is one line now (`app/selection.ts`). The history stands:
 *
 * Every other "current" treatment in the build before this ticket was full inversion —
 * a solid `text`-coloured block with `ground`-coloured type, on the masthead's nav cells,
 * the phone tab bar, the selected filter chip — and the Navigation register still
 * says so for the desktop cells this sidebar replaces. This one is neither that nor
 * `accent` (vermilion/amber): full-strength `text` label against `dim` siblings, plus a
 * `2px` left rule in `text` when current, taken directly from
 * `.impeccable/mocks/catalogue-wall.html`'s `.side a.on` rule — *no accent here — accent
 * means live action*. Issue #134 reserved `accent` for recording a watch; a sidebar that
 * borrowed it for "you are here" would spend the one colour in the application on the one
 * thing it was reserved against. This is carried as a recorded divergence
 * rather than a deviation argued only here.
 *
 * ── `isCurrentRoute`, not equality ───────────────────────────────────────────────────
 *
 * `nav-route.ts`'s one function, shared with `tab-bar.tsx` rather than each file keeping
 * its own copy of the same `startsWith` check. *Library* used to carry title detail under
 * it and *Search* the catalogue's page, so a reader three screens into either was still in
 * that section; #288 and #290 moved both to top-level addresses of their own, and
 * `nav-route.ts` records what that costs. *Lists* has no route under it — `/lists` is flat
 * — but the check costs nothing to apply uniformly, the same reasoning `tab-bar.tsx` gives
 * for *Up next*. *Settings* is the one row that gets the pushed-route treatment for real,
 * for `/settings/delete-account`.
 *
 * ── The fifth row here, and the sixth destination overall ────────────────────────────
 *
 * **Issue #227 added it, as Stats.** It was added rather than swapped in — the whole
 * difference between this column and the phone's row. `tab-bar.tsx` had a budget of four
 * and had to retire Lists to make room; a column has no such budget, and
 * constraint 6 licenses *two genuinely different layouts, not one that stretches*, so the
 * desktop kept Lists and Stats both. A sidebar that dropped Lists to mirror the phone
 * would have been copying a constraint it does not have.
 *
 * **Issue #249 repoints it at You**, because `/stats` is deleted rather than moved. The
 * row itself does not move and Lists is still the fourth: what changed is the destination
 * behind the fifth, so a reader who reaches for the fourth row of this column has been
 * reaching for it since #136 and still finds Lists there. The desktop keeps six
 * destinations, exactly as it did the day before.
 *
 * **None of that asymmetry survives.** The UI overhaul put both navigations on the one
 * list in `destinations.ts`, Lists moved inside Library, and Charcoal (issue #399) made
 * that list five: Tonight, Coming up, Search, Library, You — the same five, in the same
 * order, here and on the phone.
 */
const PRIMARY = DESTINATIONS.map(({ href, label }) => ({
  href,
  label,
  Icon: DESTINATION_ICONS[href],
}));


/* Charcoal, issue #397: the current item is *outlined* (`app/selection.ts`), where it was a
   `2px` left rule — `44px` high, a `20px` icon and a `15px` label. The line is
   `<CurrentMarker />`, one `layoutId` element that Motion slides down the column between
   destinations rather than repainting a line in a new cell. */
const ITEM =
  "relative flex h-11 items-center gap-3 rounded-[var(--radius-4)] px-3 text-note";
const CURRENT = `${ITEM} ${SELECTED}`;
const NOT_CURRENT = `${ITEM} ${UNSELECTED}`;

function CurrentMarker() {
  return (
    <m.span
      layoutId="sidebar-current"
      className={`${SELECTED_MARKER} rounded-[var(--radius-4)]`}
      transition={smooth}
    />
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const isCurrent = (href: string) => isCurrentRoute(pathname, href);
  const onUpNextLinkClick = useUpNextRepress();

  return (
    <>
      <nav aria-label="Primary" className="flex flex-col gap-1 px-2 py-2">
        {PRIMARY.map(({ href, label, Icon }) => {
          const current = isCurrent(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              // Only Tonight (`/up-next`) carries a handler at all — issue #323's one
              // gesture. Every other tab's `<Link>` is exactly what it was before this
              // ticket.
              onClick={href === "/up-next" ? onUpNextLinkClick : undefined}
              className={current ? CURRENT : NOT_CURRENT}
            >
              {current ? <CurrentMarker /> : null}
              <Icon className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

    </>
  );
}
