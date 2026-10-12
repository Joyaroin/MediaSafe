/**
 * Tonight's title as a normal Screen heading — the form it takes wherever there is no
 * featured episode to paint it over (Charcoal, issue #400): a library with no Ongoing
 * show, the empty state, and a read that failed. With a featured episode the `h1` is the
 * white *Tonight* over its artwork instead (`tonight-featured.tsx`), and this is not drawn,
 * so the screen has one `h1` either way.
 *
 * It said *Up next* until Charcoal slice 5 (issue #399) renamed the destination; *Up next*
 * is still the label on the episode a show is waiting on (`CONTEXT.md`).
 *
 * Shared with the failed state, so a failed read still reads as *Tonight, which did not
 * load* rather than a bare error on a blank page. Spacing is the caller's.
 */
export function UpNextHeading() {
  return <h1 className="screen-title text-screen text-text">Tonight</h1>;
}
