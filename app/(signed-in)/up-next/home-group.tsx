import Link from "next/link";

import { GroupTile, type GroupTileEntry } from "./group-tile";

/**
 * The tile's width on this surface, and the one measure it fixes — height is the poster's
 * own `2/3` ratio, so nothing is cropped (#135).
 *
 * `104px` is `design/catalogue-wall.html`'s own `.track > *` measure, taken rather than
 * re-derived — the same argument `up-next-tile.tsx` makes for the `132px` it needed
 * instead. It is within a pixel or two of what the three-up grid this replaces already
 * rendered at phone widths ((375 − 32 − 24) / 3 ≈ 106), so no poster changes size; what
 * changes is that the run no longer ends at the third.
 *
 * `shrink-0` is what stops flex from compressing a long group's tiles to nothing, and
 * `snap-start` is the tile's half of the snap the track asks for.
 */
const TILE = "w-[104px] shrink-0 snap-start";

/**
 * How many tiles of this group's own track are on screen before a reader scrolls it — a
 * `104px` tile plus the track's `gap-3` (`12px`) is `116px` of pitch, and even a small
 * phone viewport (`320px`, minus the track's own `px-4` gutter) covers three of those.
 * The rest of a 187-title group stays `app/poster.tsx`'s default lazy.
 */
const FIRST_RUN = 3;

/**
 * One of the phone home's five groups (issue #138) — a label, a `more ›` into that group's
 * own screen, and the group itself as a horizontally scrolling run of posters.
 *
 * The head is `design/catalogue-wall.html`'s `.pgroup`: no rule line under the label the
 * way a desktop rail carries one (`up-next-rail.tsx`) — the prototype's phone head is the
 * label and the link alone, because a screen five groups deep has no room to also explain
 * each of them.
 *
 * ── The run scrolls, and the prototype no longer decides that (issue #171) ────────────
 *
 * The prototype's `.prow` is `grid-template-columns:repeat(3,1fr)`, and #138 built exactly
 * that: three tiles, `slice`d, static. **#171 replaces it with a track**, because browsing
 * a group should not require leaving the screen you are browsing from. That is a reversal
 * of #138's shape rather than a correction of it — the build matched its mock — and it is
 * the first change made against `DESIGN.md` rather than against `design/catalogue-wall.html`,
 * which #144 retired as the contract.
 *
 * **The mechanics are `up-next-rail.tsx`'s, reused rather than re-derived.** `snap-x
 * snap-mandatory` here and `snap-start` on the tile are two halves of one rule — *a scroll
 * comes to rest on a whole poster* — and `scroll-pl-4` is load-bearing with the track's own
 * `px-4`: without it the snap aligns to the padding box and the first poster of every group
 * parks under the page's gutter. The track carries the gutter instead of the `<section>`
 * precisely so it can bleed to the viewport edges, which is what lets the trailing poster be
 * cut by the edge — the overhang that says the group continues.
 *
 * **No arrows.** The desktop rail's exist because a mouse without a horizontal wheel cannot
 * reach the track at all; that reason has no phone equivalent, and an arrow under a thumb
 * that can already swipe is decoration.
 *
 * **No cap.** The group renders everything it is handed — the same rule the desktop's *Old
 * friends* rail holds, and for the same reason: a run that silently stopped at N would be
 * the *showing 10 of 62* line with the number filed off (§9). The reads behind this
 * (`page.tsx`'s three) already return full lists and were only ever `slice`d for display, so
 * nothing new is queried; `app/poster.tsx`'s `loading="lazy"` is what keeps a 187-title
 * group off the wire until it is scrolled towards.
 *
 * ── An empty group is absent ──────────────────────────────────────────────────────────
 *
 * `entries.length === 0` renders `null` — no heading, no `more ›`, no reserved space. The
 * caller (`up-next-groups.tsx`) holds the same check for a different reason — whether
 * *every* group is empty — so this one stays here rather than being hoisted, the same
 * split `up-next-rail.tsx` and `up-next-rails-surface.tsx` already draw for the desktop
 * rails.
 *
 * ── `more ›` is unconditional, and survives the track ─────────────────────────────────
 *
 * It appears whenever the group is non-empty, even when the group fits without scrolling.
 * Its job narrows rather than disappearing: the screen behind it is a **vertical grid**
 * (`group-screen.tsx`), which is a better shape for scanning a large group than one
 * horizontal run, and it is still the only route to that screen. Hiding it once a group
 * fits would make the link's presence a count in disguise, which §9 forbids as surely as a
 * number would.
 */

export function HomeGroup({
  label,
  href,
  entries,
}: {
  /** Two words at most, needing no explanation — `design/catalogue-wall.html`'s own
   *  group labels, in Title Case, which is now also how they render — `bill-title`
   *  stopped uppercasing when the type came down. */
  label: string;
  /** That group's own screen, holding the whole of it. */
  href: string;
  entries: readonly GroupTileEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section className="pt-5">
      {/* The head keeps the page's gutter; the track below carries its own, so that it can
          bleed to the viewport edges. */}
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3">
        <h2 className="bill-title text-bill-xs text-text">{label}</h2>
        <Link
          href={href}
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
        >
          more ›
        </Link>
      </div>

      <ol className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((entry, index) => (
          <GroupTile
            key={entry.libraryEntryId}
            entry={entry}
            className={TILE}
            aboveFold={index < FIRST_RUN}
          />
        ))}
      </ol>
    </section>
  );
}
