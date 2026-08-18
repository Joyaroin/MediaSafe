"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The masthead's two nav cells, and the one thing about them that needs the browser.
 *
 * `DESIGN.md`, Layout: *two nav items (Library, Search) as full-height inverted cells*.
 * Inversion is the strongest emphasis this system has — a solid bone block with ink type —
 * and Elevation & Depth is explicit that it *replaces elevation*: the current location is
 * not underlined, not tinted, and not raised.
 *
 * ── Why this is a client component ───────────────────────────────────────────────────
 *
 * Only for `usePathname`. Until this ticket the masthead had one nav cell and said so:
 * *the active/inverted state arrives with the second nav item — with one cell there is
 * nothing to be current against, and inverting it on its own route would read as a pressed
 * button rather than a location.* There are two now, so there is something to be current
 * against, and knowing which one requires the current path.
 *
 * It is this component and not the whole masthead, so the wordmark, the Settings entrance
 * and the rest of the header stay server-rendered.
 *
 * ── `startsWith`, not equality ───────────────────────────────────────────────────────
 *
 * The library is about to gain routes under it — title detail is a pushed route on the
 * phone (#58) — and a reader three screens into their library is still in the library. The
 * boundary is a `/` so that a future `/librarian` could never light this cell up.
 */
const NAV = [
  /**
   * *Library* is your own titles and *Search* is the catalogue. `CONTEXT.md` gives those
   * two words those two meanings and no others; neither cell may ever be relabelled into
   * the other's vocabulary.
   */
  { href: "/library", label: "Library" },
  { href: "/search", label: "Search" },
];

export function NavCells() {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            // `aria-current="page"` and not just a colour: inversion is the whole visual
            // signal here, and a reader who cannot see it gets nothing without this.
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "flex items-center border-r border-rule bg-stock px-4 text-ink lg:px-5"
                : "flex items-center border-r border-rule px-4 text-stock-dim transition-colors duration-150 hover:bg-ink-raised hover:text-stock lg:px-5"
            }
          >
            <span className="code-line">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
