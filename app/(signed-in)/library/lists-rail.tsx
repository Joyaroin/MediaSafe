import Link from "next/link";

import type { ListSummary } from "@/db/access";

/**
 * A list's card on the rail — `144px`, fixed, for the reason Up next's own phone cards
 * measure is fixed: a track has no cells of its own to derive a width from, and
 * `shrink-0` is what stops flex compressing a dozen of these to nothing. `snap-start` is
 * this card's half of the track's `snap-x snap-mandatory` below.
 */
const CARD = "w-36 shrink-0 snap-start";

/**
 * Lists join the Library on the phone — issue #223, built from #215's spec.
 *
 * A horizontal rail of every list, above the grid, phone-only. The mechanics are
 * Up next's phone rail's (`up-next/up-next-phone-rail.tsx`), reused rather than
 * re-derived: `snap-x snap-mandatory` on the track,
 * `snap-start` on the card, `scroll-pl-[22px]` against the track's own `px-[22px]` so the
 * snap aligns to the page gutter and not the padding box, and a hidden scrollbar — the
 * same device that already turns a group of posters into something a thumb swipes rather
 * than a mouse drags.
 *
 * **No arrows and no `"use client"`.** Exactly `up-next/up-next-phone-rail.tsx`'s
 * reasoning: the desktop
 * rail's arrows exist for a mouse with no horizontal wheel, which has no phone equivalent,
 * and nothing here measures its own scroll.
 *
 * **No cap, and no count.** Every list renders — `entries.map`, never a `slice` — because
 * a dozen lists costing one row of *screen*, not one row of *lists*, is the whole point of
 * a rail over a capped or uncapped vertical list (#215's Implementation Decisions). §9's
 * no-counts rule holds the same way it holds on every other rail: `ListSummary.titleCount`
 * is read here but never printed.
 *
 * **A card is a `Link`, and carries no hold gesture.** #215: *"A hold on a list card does
 * nothing... an action bar offering Add to list and Abandon means nothing for one."* So
 * this imports no selection context and no `useHoldToSelect` — the plain press a `<Link>`
 * already gives a browser is the whole of what this card does with a long press.
 *
 * **This is the caller's to hide during selection**, the same split `library-surface.tsx`
 * already draws for the filter bar: `LibraryColumn` holds the one `useIsSelecting()` read
 * for the whole column, and a second read here would be a second subscription to the same
 * boolean rather than a second fact.
 *
 * **An empty rail is absent** — no heading, no sentence, no zero, no reserved space, the
 * same rule every other rail in this app is held to (`DESIGN.md` §7, §11).
 */
export function ListsRail({ lists }: { readonly lists: readonly ListSummary[] }) {
  if (lists.length === 0) return null;

  return (
    <section className="pt-[18px] lg:hidden">
      <ol className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-pl-[22px] px-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lists.map((list) => (
          <li key={list.id} className={CARD}>
            <Link
              href={`/lists/${list.id}`}
              className="pressable flex h-14 items-center rounded-[var(--radius-6)] bg-raised px-3.5"
            >
              <span className="block w-full truncate text-card font-medium leading-[1.25] tracking-[-0.01em] text-ink">
                {list.name}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
