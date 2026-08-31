/**
 * The one transition-name family the poster morph (#141) pairs a source tile with its
 * destination poster by. One function, so a rename touches this file rather than the
 * several call sites that used to spell the template literal by hand: the rail tile
 * (`up-next-tile.tsx`), the desktop programme note pane (`programme-note.tsx`) and the
 * title's own page (`[entryId]/title-detail-view.tsx`) all mint `rail-poster-{id}`.
 *
 * ── ⚠️ There were two families until #275, and this reverses that ────────────────────
 *
 * > The rule this file carried was: *the two families stay disjoint rather than becoming
 * > one function, because the desktop pane and the phone route can both be showing the
 * > same title at once, and a shared name would pair the wrong two elements.* The desktop
 * > pane held `rail-poster-{id}`; a second function minted `group-poster-{id}` for the
 * > phone's sheet and the phone's route.
 *
 * That reasoning described a phone with **two** destinations — a title sheet raised over
 * `/up-next`, and a `/library/{id}` route reached by an interception. #268 deleted both
 * interceptions and the sheet with them, and every tile and card on Up next now navigates
 * to the same page. The two surfaces that needed separate names are one surface, so the
 * families collapse to one and the second minting function is gone with no caller.
 *
 * The "same title at once" case the old note worried about was a reader on the desktop
 * pane with the phone route open **in another tab** — two documents, never one, and a
 * `view-transition-name` has never been shared across documents. What is genuinely on
 * screen together is the rail tile and its destination, and that pair is what the
 * name-drop handles: the tile releases the name the moment the pane holds it
 * (`up-next-tile.tsx`), and on the phone the tile is gone with the page it left.
 */
export function railPosterTransitionName(libraryEntryId: string): string {
  return `rail-poster-${libraryEntryId}`;
}
