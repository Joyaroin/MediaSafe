
/**
 * The landing heading. It says *Up next* — the name of the tab that brought you here —
 * on every screen size and at every hour. It used to say *This morning*, *This afternoon*
 * or *Tonight*, which meant the tab and the page it opened had different names.
 *
 * Shared by the populated, pending and failed states, so a failed read still reads as
 * *Up next, which did not load* rather than a bare error on a blank page.
 */
export function UpNextHeading() {
  return (
    <div className="px-gutter pt-1.5 pb-0.5">
      <h1 className="screen-title text-screen text-text">Up next</h1>
    </div>
  );
}
