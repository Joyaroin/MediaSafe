import Link from "next/link";
import * as m from "motion/react-m";
import type { CSSProperties, ReactNode } from "react";

import { smooth } from "@/app/motion";
import { PosterLink } from "@/app/(signed-in)/library/poster-link";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import type { ListDetailTitleRow } from "@/db/access";

/**
 * One row of a list, in order — issue #147's *ordered rows with a small poster, not a
 * poster grid*, because position is the point of a list and a grid does not show one.
 *
 * ── The number is on screen, not implied by array order ───────────────────────────────
 *
 * `title.position` is rendered directly rather than derived from where the row falls in
 * the list this component is mapped over — the acceptance criterion is *each row's
 * position is visible*, a fact about the glass, and `db/access.ts`'s `getListDetail`
 * already orders by it, so this is the one number that must be printed rather than
 * assumed to match the array index — issue #149's `ReorderableTitleList` keeps the two in
 * step by renumbering `position` the moment a drag changes the order, rather than this
 * component ever computing one from where it falls in a `.map()`.
 *
 * ── Every row is a link; which page it links to is the ownership question ─────────────
 *
 * A list holds anything in the catalogue (issue #133), so a row is a title this account
 * has added or one it has not, and issue #148 gives the second case a page of its own.
 * An owned row links to `titles/[entryId]` — your copy, with your progress on it. An
 * unowned row links to `catalogue/[kind]/[tmdbId]`, which is the same borrowed facts with no
 * owned fact anywhere on it and one *Add to library*. Two destinations rather than two
 * kinds of row: what differs is the key each page is keyed by, and that difference is the
 * whole of how the read stays scoped (`db/access.ts`'s `getUnownedTitleDetail`).
 *
 * Through #147 this branch rendered a row with nothing to press, because the destination
 * did not exist yet. It exists now, and a listed title you have not started is one tap
 * from being one you have.
 *
 * Both are a plain `Link`, not `SelectableEntry`
 * (`library/selectable-entry.tsx`): that component reads `useLibrarySelection()`, whose
 * provider only wraps `library-surface.tsx` — the desktop pane exists on `/library` and
 * nowhere else. A list has no pane of its own, so every row here is a real navigation on
 * both devices, the same shape the phone route already uses for title detail.
 *
 * ── `dragHandle` is a sibling of the link, never inside it ────────────────────────────
 *
 * `list-row.tsx`'s own docblock: *"HTML forbids nesting a `<button>` inside an `<a>`."*
 * Issue #149's drag handle is a real button — it has to be, for the keyboard path — so it
 * sits beside `Link` in the `<li>` rather than inside it, and `ReorderableTitleList` is
 * the only caller, which is why this prop is required rather than optional.
 *
 * ── The row is `m.li`, and the spring only ever drives `shift` — issue #337 ───────────
 *
 * The row that `ReorderableTitleList` is actively dragging writes its own `transform`
 * directly in `style`, exactly as before: a finger reads at one pixel per pixel, and a spring
 * chasing a value that is already tracking the pointer is the glassiness `app/motion.ts`
 * describes, not a fix for it. Every other row is a gap opening or closing around that
 * drag, and that is what `shift` animates — on the motion module's own spring rather than
 * the hand-written `transform var(--dur-fast) ease` this replaces, so reversing the drag
 * mid-gesture carries the row's velocity into the new target instead of restarting it from
 * rest. `shiftFor` never moves the row it belongs to, so `style` and `shift` never fight
 * over the same row at once.
 */
export function ListTitleRow({
  title,
  dragHandle,
  liRef,
  style,
  shift = 0,
  aboveFold = false,
  trailing,
}: {
  readonly title: ListDetailTitleRow;
  readonly dragHandle: ReactNode;
  /** How `ReorderableTitleList` measures this row's height at the start of a drag. */
  readonly liRef?: (element: HTMLLIElement | null) => void;
  /** The dragged row's own live transform, written directly and never through Motion —
   *  `undefined` for every row except the one currently under a finger. */
  readonly style?: CSSProperties;
  /** How far this row springs to open or close the gap a neighbour's drag leaves, in
   *  pixels. Ignored (never applied) while `style` is set, since a row is never both the
   *  one being dragged and one making way for it. */
  readonly shift?: number;
  /** This row is the list's first — `ReorderableTitleList`'s to say, since a list renders
   *  one row per title (`app/poster.tsx`). */
  readonly aboveFold?: boolean;
  /** A control after the row's link — list detail's *take it off this list*. */
  readonly trailing?: ReactNode;
}) {
  const meta = metaLine(title);

  const content = (
    <>
      {/* The position as a serif Numeral (handoff §8.5), centred in its own column so one
          and two digits line up on the same axis. */}
      <span className="bill-title w-6 shrink-0 text-center text-bill-md text-dim" data-numeric>
        {title.position}
      </span>

      <div className="w-10 shrink-0">
        <Poster
          posterPath={title.posterPath}
          name={title.name}
          width={40}
          className="w-10"
          aboveFold={aboveFold}
        >
          {/* The icon view's bar, on the row view's smaller poster. Both views of one list
              answer the same question the same way; a bar that appeared on only one of
              them would read as a fact about the view rather than about the title. */}
          <PosterProgressBar progress={title.progress} />
        </Poster>
      </div>

      <div className="min-w-0 flex-1">
        {/* The name in the sans at Row size, over a Meta line (handoff §8.5) — the
            serif is the position's, to the left. */}
        <h2 className="truncate text-row font-semibold text-text">{title.name}</h2>
        {meta === null ? null : (
          <p className="mt-0.5 text-meta text-dim" data-numeric>
            {meta}
          </p>
        )}
      </div>
    </>
  );

  // Issue #433: a surface, pressing at the default register. `pressable` already declares
  // `transition` (`app/globals.css`), and a second `transition-colors` utility here would
  // fight it over which one wins (`app/tab-bar.tsx`'s own docblock names the failure) — so
  // `hover:bg-raised`'s fade now rides the press's own transition list instead.
  const rowClass =
    "pressable flex min-h-[76px] min-w-0 flex-1 items-center gap-3 py-2 hover:bg-raised";

  const inner =
    title.libraryEntryId === null ? (
      <Link href={`/catalogue/${title.kind}/${title.tmdbId}`} className={rowClass}>
        {content}
      </Link>
    ) : (
      <PosterLink
        libraryEntryId={title.libraryEntryId}
        posterPath={title.posterPath}
        className={rowClass}
      >
        {content}
      </PosterLink>
    );

  return (
    <m.li
      ref={liRef}
      style={style}
      animate={style === undefined ? { y: shift } : undefined}
      transition={smooth}
      className="flex items-center gap-1 border-b border-hair bg-ground"
    >
      {dragHandle}
      {inner}
      {trailing}
    </m.li>
  );
}

function metaLine(title: ListDetailTitleRow): string | null {
  const parts: string[] = [];
  if (title.releaseYear !== null) parts.push(String(title.releaseYear));
  parts.push(title.kind === "film" ? "Film" : "Show");
  return parts.join(" · ");
}
