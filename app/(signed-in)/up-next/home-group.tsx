import Link from "next/link";

import { GroupTile, type GroupTileEntry } from "./group-tile";

/**
 * One of the phone home's five vertical groups (issue #138) — a label, a `more ›` into
 * that group's own screen, and a preview of it. `design/catalogue-wall.html`'s `.pgroup`,
 * which is binding on appearance: no rule line under the label the way a desktop rail
 * carries one (`up-next-rail.tsx`) — the prototype's phone head is the label and the link
 * alone, because a screen five groups deep has no room to also explain each of them.
 *
 * ── An empty group is absent ──────────────────────────────────────────────────────────
 *
 * `entries.length === 0` renders `null` — no heading, no `more ›`, no reserved space. The
 * caller (`up-next-groups.tsx`) holds the same check for a different reason — whether
 * *every* group is empty — so this one stays here rather than being hoisted, the same
 * split `up-next-rail.tsx` and `up-next-rails-surface.tsx` already draw for the desktop
 * rails.
 *
 * ── `more ›` is unconditional ─────────────────────────────────────────────────────────
 *
 * It appears whenever the group is non-empty, even when there are three or fewer entries
 * and the screen behind it would show exactly what is already on screen — the prototype's
 * own behaviour, and the alternative (hiding it once a group fits) would make the link's
 * presence a count in disguise, which §9 forbids as surely as a number would.
 */
const HOME_GROUP_TILE_COUNT = 3;

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
    <section className="px-4 pt-5">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="bill-title text-bill-xs text-text">{label}</h2>
        <Link
          href={href}
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text"
        >
          more ›
        </Link>
      </div>

      <ol className="grid grid-cols-3 gap-3">
        {entries.slice(0, HOME_GROUP_TILE_COUNT).map((entry) => (
          <GroupTile key={entry.libraryEntryId} entry={entry} />
        ))}
      </ol>
    </section>
  );
}
