/**
 * The landing heading. It says *Tonight* — the name of the tab that brought you here —
 * on every screen size and at every hour, so the tab and the page it opens have one name.
 * It said *Up next* until Charcoal slice 5 (issue #399) renamed the destination; *Up next*
 * is still the label on the episode a show is waiting on (`CONTEXT.md`).
 *
 * **Not painted** since the UI overhaul: the tab bar and the sidebar already say it, and a
 * heading repeating it took a band of the phone's first screen. It stays a real `h1`, so
 * the page's outline is unchanged for a screen reader. Slice 6 paints it over the
 * featured artwork.
 *
 * Shared by the populated, pending and failed states, so a failed read still reads as
 * *Tonight, which did not load* rather than a bare error on a blank page.
 */
export function UpNextHeading() {
  return <h1 className="sr-only">Tonight</h1>;
}
