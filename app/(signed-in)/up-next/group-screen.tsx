import { GroupTile, type GroupTileEntry } from "./group-tile";

/**
 * The screen behind one of the phone home's `more ›` links (issue #138) — a heading and
 * the whole of one group, shipped in this diff rather than reserved for later (§9: *no
 * "coming soon", no `more ›` that leads nowhere*).
 *
 * Shared by all five of `app/(signed-in)/up-next/{ongoing,coming-back,old-friends,
 * watchlist,abandoned}/page.tsx` — one heading, one grid, one empty treatment — so a
 * screen cannot drift from its four siblings by accident. Each caller's own `page.tsx` is
 * where the five genuinely differ: which read backs the group, and what a failed one of
 * them says (the segment's existing `up-next/error.tsx`, inherited rather than repeated —
 * there is no `try` here or in any caller, `AGENTS.md`).
 *
 * ── OLD FRIENDS, at two hundred titles ────────────────────────────────────────────────
 *
 * This is the fetch strategy issue #138 asks for: one unbounded read, the same one the
 * desktop rail already renders in full (`up-next-rails-surface.tsx`), and `app/poster.tsx`'s
 * `loading="lazy"` is what keeps two hundred posters off the wire until a reader actually
 * scrolls to them — the DOM cost is real and the network cost is not. No pagination and no
 * virtual list: both would be a second fetch strategy answering a question the rail's own
 * one read has already answered at this exact scale.
 *
 * ── No pane, no swap — a plain grid of `Link`s ────────────────────────────────────────
 *
 * `group-tile.tsx`'s own note: this screen has no desktop pane to select into, so a tile
 * here always pushes `/library/{id}` — at any width, since nothing gates this route to the
 * phone the way `up-next-groups.tsx` gates the five groups it is reached from.
 */
export function GroupScreen({
  label,
  entries,
}: {
  /** Two words at most — the same label the home's `HomeGroup` printed for this group. */
  label: string;
  entries: readonly GroupTileEntry[];
}) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="border-b border-hair px-4 pt-5 pb-3">
        <h1 className="bill-title text-bill-lg text-text">{label}</h1>
      </div>

      {entries.length === 0 ? (
        /**
         * Reachable only by a direct visit to a group that emptied between the home
         * rendering its `more ›` and this screen loading it — the home never links here
         * for a group with nothing in it (`home-group.tsx`). Not `UpNextEmpty`: that
         * component's *you're caught up* answers a different, wider question than *this
         * one group has nothing in it right now*.
         */
        <section className="px-6 py-16 text-center">
          <p className="text-note text-dim">Nothing here right now.</p>
        </section>
      ) : (
        <ol className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-6">
          {entries.map((entry) => (
            <GroupTile key={entry.libraryEntryId} entry={entry} />
          ))}
        </ol>
      )}
    </main>
  );
}
