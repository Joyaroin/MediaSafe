"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { smooth } from "./motion";
import { LibraryIcon, ListsIcon, SearchIcon, SettingsIcon, UpNextIcon } from "./nav-icons";
import { isCurrentRoute } from "./nav-route";

/**
 * The sidebar's five destinations, and the one thing about them that needs the browser —
 * issue #136, merged against issue #146 rather than after it. `sidebar.tsx` renders the
 * wordmark and the display name around this; this is only the part that has to know which
 * route the reader is on.
 *
 * ── Lists, arriving already built ────────────────────────────────────────────────────
 *
 * #146 shipped *Lists* onto the masthead's nav cells and the phone tab bar while this
 * sidebar did not exist yet, saying explicitly that whatever #132's eventual sidebar did
 * would inherit the destination rather than re-decide it (`SPEC.md` §9). It is the fourth
 * item in `PRIMARY` for that reason — not a fresh design decision made here, but the one
 * #146 already made, carried into the nav that finally exists to carry it.
 *
 * ── No accent, on purpose ─────────────────────────────────────────────────────────────
 *
 * Every other "current" treatment in the build before this ticket was full inversion —
 * a solid `text`-coloured block with `ground`-coloured type, on the masthead's nav cells,
 * the phone tab bar, the selected filter chip — and `DESIGN.md`'s Navigation section still
 * says so for the desktop cells this sidebar replaces. This one is neither that nor
 * `accent` (vermilion/amber): full-strength `text` label against `dim` siblings, plus a
 * `2px` left rule in `text` when current, taken directly from
 * `.impeccable/mocks/catalogue-wall.html`'s `.side a.on` rule — *no accent here — accent
 * means live action*. Issue #134 reserved `accent` for recording a watch; a sidebar that
 * borrowed it for "you are here" would spend the one colour in the application on the one
 * thing it was reserved against. `SPEC.md` §10.3 carries this as a recorded divergence
 * from `DESIGN.md` rather than leaving the deviation argued only here.
 *
 * ── `isCurrentRoute`, not equality ───────────────────────────────────────────────────
 *
 * `nav-route.ts`'s one function, shared with `tab-bar.tsx` rather than each file keeping
 * its own copy of the same `startsWith` check: *Library* and *Search* carry pushed and
 * replaced routes under them, and a reader three screens into either is still in that
 * section. *Lists* has no route under it — `/lists` is flat — but the check costs
 * nothing to apply uniformly, the same reasoning `tab-bar.tsx` gives for *Up next*.
 * *Settings* gets the pushed-route treatment for real, for `/settings/delete-account`.
 */
const PRIMARY = [
  { href: "/up-next", label: "Up next", Icon: UpNextIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/lists", label: "Lists", Icon: ListsIcon },
] as const;

const SETTINGS = { href: "/settings", label: "Settings", Icon: SettingsIcon } as const;

/* Both states keep the transparent `2px` left border. It is pure spacing now — the
   visible marker is `<CurrentMarker />`, one `layoutId` element that Motion slides down
   the column between destinations instead of repainting a border in a new cell. Leaving
   the border on both is what keeps the label from shifting 2px sideways as the marker
   arrives, which is the tell that a marker was faked with a border. */
const CURRENT =
  "relative flex items-center gap-3 border-l-2 border-transparent py-2.5 pl-4 pr-5 text-text";
const NOT_CURRENT =
  "relative flex items-center gap-3 border-l-2 border-transparent py-2.5 pl-4 pr-5 text-dim transition-colors duration-[var(--dur-fast)] hover:text-text";

/** The travelling `2px` rule. `-left-0.5` puts it back over the transparent border it
 *  replaces, so the marker lands exactly where the old static border sat. */
function CurrentMarker() {
  return (
    <motion.span
      layoutId="sidebar-current"
      className="absolute -left-0.5 top-0 h-full w-0.5 bg-text"
      transition={smooth}
    />
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const isCurrent = (href: string) => isCurrentRoute(pathname, href);

  return (
    <>
      <nav aria-label="Primary" className="flex flex-col py-2">
        {PRIMARY.map(({ href, label, Icon }) => {
          const current = isCurrent(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={current ? CURRENT : NOT_CURRENT}
            >
              {current ? <CurrentMarker /> : null}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="code-line">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* `DESIGN.md`'s Hairline Rule: a `1px` `hair` rule between the four primary
          destinations and Settings, the same division the masthead used to draw between
          its nav cells and its Settings entrance — carried over as a rule rather than as
          another bordered cell, since the sidebar is a column, not a row. */}
      <div className="mx-4 border-t border-hair" />

      <nav aria-label="Settings" className="flex flex-col py-2">
        <Link
          href={SETTINGS.href}
          aria-current={isCurrent(SETTINGS.href) ? "page" : undefined}
          className={isCurrent(SETTINGS.href) ? CURRENT : NOT_CURRENT}
        >
          {/* Same `layoutId` as the primary nav's, deliberately: the marker slides
              across the dividing rule into Settings rather than cutting, because it is
              one selection moving through one column, not two independent navs. */}
          {isCurrent(SETTINGS.href) ? <CurrentMarker /> : null}
          <SETTINGS.Icon className="h-4 w-4 shrink-0" />
          <span className="code-line">{SETTINGS.label}</span>
        </Link>
      </nav>
    </>
  );
}
