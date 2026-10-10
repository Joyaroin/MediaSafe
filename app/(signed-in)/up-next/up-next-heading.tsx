
/**
 * The landing heading. It says *Up next* — the name of the tab that brought you here —
 * on every screen size and at every hour. It used to say *This morning*, *This afternoon*
 * or *Tonight*, which meant the tab and the page it opened had different names.
 *
 * **Not painted** since the UI overhaul: the tab bar and the sidebar already say *Up next*,
 * and a heading repeating it took a band of the phone's first screen. It stays a real
 * `h1`, so the page's outline is unchanged for a screen reader.
 *
 * Shared by the populated, pending and failed states, so a failed read still reads as
 * *Up next, which did not load* rather than a bare error on a blank page.
 */
export function UpNextHeading() {
  return <h1 className="sr-only">Up next</h1>;
}
