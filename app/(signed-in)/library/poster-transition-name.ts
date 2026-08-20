/**
 * The two transition-name families the poster morph (#141) pairs a source tile with its
 * destination poster by. One function per family, so a rename touches this file rather
 * than the several call sites that used to spell the template literal by hand — the
 * desktop rail tile and the programme note pane share `rail-poster-{id}`
 * (`up-next-tile.tsx`, `programme-note.tsx`), the phone's group tile and the title
 * detail route share `group-poster-{id}` (`group-tile.tsx`, `title-detail-view.tsx`).
 * `programme-note-content.tsx`'s own docblock is why the two families stay disjoint
 * rather than becoming one function: the desktop pane and the phone route can both be
 * showing the same title at once, and a shared name would pair the wrong two elements.
 */
export function railPosterTransitionName(libraryEntryId: string): string {
  return `rail-poster-${libraryEntryId}`;
}

export function groupPosterTransitionName(libraryEntryId: string): string {
  return `group-poster-${libraryEntryId}`;
}
