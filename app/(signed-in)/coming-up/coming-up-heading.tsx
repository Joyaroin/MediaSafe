/**
 * Coming up's heading — the name of the tab that brought the reader here, as a real `h1`
 * that is not painted: the tab bar and the sidebar already say it, the same reasoning as
 * `up-next-heading.tsx`. Slice 7 of the Charcoal redesign draws a visible Screen heading.
 *
 * Shared by the page, its loading boundary and its failure, so a failed read still reads
 * as *Coming up, which did not load*.
 */
export function ComingUpHeading() {
  return <h1 className="sr-only">Coming up</h1>;
}
