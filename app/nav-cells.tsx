"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The masthead's nav cells, and the one thing about them that needs the browser.
 *
 * `DESIGN.md`, Layout, named two nav items — *Library, Search* — as full-height inverted
 * cells; issue #146 adds a third, *Lists*, and that update is carried into `DESIGN.md`'s
 * own Navigation section rather than left for this file alone to know. Inversion is the
 * strongest emphasis this system has — a solid `text`-coloured block with `ground`-coloured
 * type — and Elevation & Depth is explicit that it *replaces elevation*: the current
 * location is not underlined, not tinted, and not raised.
 *
 * `SPEC.md` §9 describes *Lists* as a fifth sidebar item, reasoning from #132's
 * not-yet-built sidebar redesign. That redesign has not landed — this masthead is still
 * #132's predecessor, two cells becoming three — so the count here is three, not five;
 * the destination and its placement on both devices are what #146 actually asks for, and
 * both hold regardless of which nav this cell sits in.
 *
 * ── Why this is a client component ───────────────────────────────────────────────────
 *
 * Only for `usePathname`. Until issue #56 the masthead had one nav cell and said so: *the
 * active/inverted state arrives with the second nav item — with one cell there is nothing
 * to be current against.* There are three now, so there is something to be current
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
   * the other's vocabulary. *Lists* is neither — it is the destination for a grouping you
   * made by hand, not your library and not the catalogue.
   */
  { href: "/library", label: "Library" },
  { href: "/search", label: "Search" },
  { href: "/lists", label: "Lists" },
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
                ? "flex items-center border-r border-hair bg-text px-4 text-ground lg:px-5"
                : "flex items-center border-r border-hair px-4 text-dim transition-colors duration-150 hover:bg-raised hover:text-text lg:px-5"
            }
          >
            <span className="code-line">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
