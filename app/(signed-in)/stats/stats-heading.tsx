/**
 * The Stats destination's own head — issue #227, and the same three-caller shape
 * `lists-heading.tsx` and `library-heading.tsx` have: the populated screen, the empty one,
 * and the failure boundary all render it, so a read that fails is visibly *Stats, which did
 * not load* rather than a bare error on a blank page.
 *
 * Turn 9's `screen-title` at 34px in `--ink`, on the 22px gutter, with no hairline under it
 * — level with the other three phone tabs, which is what this destination now is
 * (`app/tab-bar.tsx`). `library-heading.tsx` carries the argument for why all four are the
 * same step.
 */

/** The heading's id, so the page's sections can be labelled by it. */
export const STATS_HEADING_ID = "stats-heading";

export function StatsHeading() {
  return (
    <div className="px-[22px] pt-5">
      <h1 id={STATS_HEADING_ID} className="screen-title text-screen text-ink">
        Stats
      </h1>
    </div>
  );
}
