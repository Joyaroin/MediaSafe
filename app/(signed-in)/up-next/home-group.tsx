import Link from "next/link";

import { GroupTile, type GroupTileEntry } from "./group-tile";

/**
 * The tile's width on this surface, and the one measure it fixes — height is the poster's
 * own `2/3` ratio, so nothing is cropped (#135).
 *
 * `116px` is turn 9's measure, up from the `104px` #171 took from
 * `design/catalogue-wall.html`'s `.track > *`. The redesign widened the page gutter from
 * 16px to 22px and the track gap from 12px to 14px, so a wider tile is what keeps the
 * same *three-and-a-bit* run visible on a 390px screen that the narrower one gave on the
 * old gutters — the overhang that says the group continues is the thing being held
 * constant here, not the number.
 *
 * `shrink-0` is what stops flex from compressing a long group's tiles to nothing, and
 * `snap-start` is the tile's half of the snap the track asks for.
 */
const TILE = "w-[116px] shrink-0 snap-start";

/**
 * How many tiles of this group's own track are on screen before a reader scrolls it — a
 * `116px` tile plus the track's `14px` gap is `130px` of pitch, and a 390px phone
 * viewport minus the track's own `22px` gutters covers two and a half of those. Kept at
 * three rather than dropped to two: the third tile is half-visible at the fold on the
 * common width, and an eager fetch for a poster a reader can already see part of is the
 * fetch this constant exists to make. The rest of a 187-title group stays
 * `app/poster.tsx`'s default lazy.
 */
const FIRST_RUN = 3;

/**
 * One of the phone home's five groups (issue #138) — a label, a `More` link into that
 * group's own screen, and the group itself as a horizontally scrolling run of posters.
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
 * comes to rest on a whole poster* — and `scroll-pl-[22px]` is load-bearing with the
 * track's own `px-[22px]`: without it the snap aligns to the padding box and the first poster of every group
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
 * `entries.length === 0` renders `null` — no heading, no `More`, no reserved space. The
 * caller (`up-next-groups.tsx`) holds the same check for a different reason — whether
 * *every* group is empty — so this one stays here rather than being hoisted, the same
 * split `up-next-rail.tsx` and `up-next-rails-surface.tsx` already draw for the desktop
 * rails.
 *
 * ── `More` is unconditional, and survives the track ──────────────────────────────────
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
  abandoned = false,
}: {
  /** Two words at most, needing no explanation — `design/catalogue-wall.html`'s own
   *  group labels, in Title Case. Turn 9 sets them in the label register, which
   *  uppercases them again in CSS: the *content* stays Title Case so a screen reader
   *  and a `More` link both read a word rather than an acronym. */
  label: string;
  /** That group's own screen, holding the whole of it. */
  href: string;
  entries: readonly GroupTileEntry[];
  /**
   * Every title in this group is abandoned.
   *
   * Named for the state and not for what the state looks like — `dimmed` would make the
   * dim here and the dim in `library-entry-cell.tsx` two coincidences rather than one
   * fact rendered twice, and it would go stale the moment the treatment changed.
   *
   * A property of the *group*, not of the tile, and only because of how this screen is
   * built: `up-next-groups.tsx` reads the five states as five separate arrays, so the
   * rows in the Abandoned group carry no state field to branch on the way
   * `library-entry-cell.tsx`'s do. `GroupTileEntry` is the shape both `UpNextEntry` and
   * `LibraryStateGroupEntry` already satisfy and neither carries `state`; widening it to
   * add one would make four groups pass a column they know the answer to statically.
   */
  abandoned?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="pt-[26px]">
      {/* The head keeps the page's gutter; the track below carries its own, so that it can
          bleed to the viewport edges.

          Turn 9 puts both halves in the accent and drops the underline: the label moves
          from the bill's condensed cut to the label register, and `more ›` becomes a
          plain `More` at the body step. The chevron went with the underline — a link
          already reading as the one warm thing in the row does not also need an arrow
          pointing at itself.

          This head is Up next's whole accent role — *the way through this screen*, in
          `globals.css`'s terms — and it repeats once per group, which is five times over
          on a full screen. That is five instances of one role and not five spends; the
          rule is stated as roles rather than as a count precisely so that a repeating
          structure does not read as a violation. What would violate it is a *second*
          accent role appearing here — a vermilion tile, badge or control alongside these
          heads. There is none, and there is no recording control on this surface at all
          (`up-next-groups.tsx`). */}
      <div className="flex items-center justify-between gap-3 px-[22px] pb-3">
        <h2 className="label-line text-accent">{label}</h2>
        <Link
          href={href}
          className="text-item font-medium text-accent transition-opacity duration-[var(--dur-fast)] hover:opacity-70"
        >
          More
        </Link>
      </div>

      <ol className="flex snap-x snap-mandatory gap-[14px] overflow-x-auto scroll-pl-[22px] px-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((entry, index) => (
          <GroupTile
            key={entry.libraryEntryId}
            entry={entry}
            className={TILE}
            aboveFold={index < FIRST_RUN}
            abandoned={abandoned}
          />
        ))}
      </ol>
    </section>
  );
}
