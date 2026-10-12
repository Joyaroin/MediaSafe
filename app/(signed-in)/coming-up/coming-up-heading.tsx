/**
 * Coming up's screen heading — the serif at Screen size (Charcoal §8.2), painted as the
 * boards draw it. It was an unpainted `h1` while this screen was still the pager's second
 * page redrawn as a route (slice 5).
 *
 * Shared by the page, its loading boundary and its failure, so a failed read still reads
 * as *Coming up, which did not load*.
 */
export function ComingUpHeading() {
  return (
    <header className="px-gutter pt-5 pb-1 lg:pt-7">
      <h1 className="screen-title text-screen text-text">Coming up</h1>
    </header>
  );
}
