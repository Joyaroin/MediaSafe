/**
 * The two transition-name families the poster morph (#141) pairs a source tile with its
 * destination poster by. One function per family, so a rename touches this file rather
 * than the several call sites that used to spell the template literal by hand — the
 * desktop rail tile and the programme note pane share `rail-poster-{id}`
 * (`up-next-tile.tsx`, `programme-note.tsx`), and the title detail route holds
 * `group-poster-{id}` (`[entryId]/title-detail-view.tsx`).
 *
 * `programme-note-content.tsx`'s own docblock is why the two families stay disjoint rather
 * than becoming one function: the desktop pane and the phone route can both be showing the
 * same title at once, and a shared name would pair the wrong two elements.
 *
 * ── ⚠️ The group family currently has a destination and no source (#250) ─────────────
 *
 * `group-poster-{id}` was minted by the phone's Up next group tile, which pressed through
 * to `/library/[entryId]` and morphed its poster into that page's. #250 deleted that tile
 * along with the five vertical groups, and **nothing produces the name any more**: the
 * phone's remaining route into title detail is `selectable-entry.tsx`, which pushes without
 * a transition name, and the new episode card links to the same route without one either.
 *
 * A `view-transition-name` with nothing to pair against is inert rather than broken — the
 * browser simply runs no morph — so this is a **dormant half**, not a bug. It is recorded
 * here rather than deleted for two reasons: `title-detail-view.tsx` is a real destination
 * that a future source can pair with, and #254's episode detail is the obvious candidate.
 * Whoever picks it up should either give the phone's card the matching name or delete both
 * halves; what must not happen is this quietly becoming folklore about a morph that no
 * longer runs.
 */
export function railPosterTransitionName(libraryEntryId: string): string {
  return `rail-poster-${libraryEntryId}`;
}

export function groupPosterTransitionName(libraryEntryId: string): string {
  return `group-poster-${libraryEntryId}`;
}
