/**
 * The bill's head — one heading on one hairline, and (now that #57 has arrived) the filter
 * chips, the filter-by-typing field and the sort select alongside it.
 *
 * The reference build draws all four in one `flex flex-wrap` row so that on
 * a narrow phone the controls wrap under the heading rather than opening a second bordered
 * bar underneath it. `children` is that row's remainder: empty when there is nothing to
 * filter, `LibraryBar`'s chips/field/select when there is.
 *
 * ── Turn 9 makes it a screen title, and levels it with the other three ───────────────
 *
 * This used to be `text-bill-sm` — deliberately *smaller* than Search's `text-bill-lg`,
 * on the argument that *Search is a page you read and this is a section head over the
 * thing you came to look at*. The linen redesign overrules that: all four phone tabs get
 * the same 34px `screen-title`, because on a phone they are four peer destinations
 * reached by four peer tabs, and a heading that is smaller on one of them reads as that
 * screen being a level deeper than it is. The hairline under the row goes with it, for
 * the same reason the masthead's and Up next's did.
 *
 * It is shared by three callers — the populated screen, the genuinely empty one, and the
 * failure boundary — so that a failed read is visibly *the library, which did not load*
 * rather than a bare error on a blank page, and so the three cannot drift apart. Only the
 * populated caller passes `children`: reserving space for controls
 * that have nothing to act on is forbidden, which is exactly what the genuinely empty library
 * and a failed read both are.
 */

/** The heading's id, so the grid can point `aria-labelledby` at it. */
export const LIBRARY_HEADING_ID = "library-heading";

export function LibraryHeading({
  control,
  children,
}: {
  /** The Shows / Films / Lists control: under the heading on a phone, level with it on a
   *  desktop (handoff §8.4). */
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    // A column, not a wrapping row. The controls used to sit *beside* the heading and
    // wrap under it on a narrow screen; turn 9 stacks them deliberately — the title, then
    // the chips, then the filter row — because a 34px title with a 32px chip on its
    // baseline is two different registers fighting for the same line. `gap-y` is not
    // uniform between them (Up next's rail heads have the same shape), so the children space
    // themselves rather than being spaced from here.
    <div className="flex flex-col px-gutter pt-5 lg:px-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <h1 id={LIBRARY_HEADING_ID} className="screen-title text-screen text-text">
          Library
        </h1>

        {control}
      </div>

      {children}
    </div>
  );
}
