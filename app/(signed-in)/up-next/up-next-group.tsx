/**
 * One group of Up next, as a **vertical list** — the shape that replaces `RailSection`'s
 * horizontal track and `up-next-rail.tsx`'s arrow-and-snap machinery on this screen.
 *
 * ── Why the rails went ────────────────────────────────────────────────────────────────
 *
 * A rail is a good container for a poster and a bad one for a sentence. Up next's rows
 * carry a show name, a season/episode code, an episode name and a remainder, and inside a
 * `262px` card those four things stack and the episode name is the one that loses. The
 * same four sit on one line of a full-width row with room to spare, which is the whole
 * reason for the change: nothing was shortened, the container was widened.
 *
 * What went with the track: the reach measurement, the two arrows, the scroll-snap, the
 * `ResizeObserver` and the remembered horizontal offset (`restoration.ts`'s
 * `withRailOffset`). A list is scrolled by the page it is on, and the page's own position
 * is already restored.
 *
 * **`RailSection` is not deleted**, and this does not replace it. Upcoming
 * (`upcoming-films.tsx`) and the library's lists rail (`lists-rail.tsx`) are still rails
 * and are not in this ticket's scope; they keep it.
 *
 * ── The accent, and why two roles on this screen is still one rule ─────────────────────
 *
 * The group label is accent, and so is the mark on every row. `app/globals.css` gives the
 * accent three roles and says a screen may show one — and `up-next-phone-rail.tsx` already
 * argued this exact pair through: *"the two stay legible apart because they sit in
 * different places: a heading above a track, a control in a card's last row. What would
 * violate the rule is a third."* The list changes where they sit, not how many there are.
 *
 * `More ›` is that same head role repeating, not a fourth spend.
 */
export function UpNextGroup({
  label,
  rule,
  more,
  children,
}: {
  readonly label: string;
  /** The one-line statement of what puts a title in this group. Absent on the phone,
   *  where the screen is narrow enough that the label alone is the whole head. */
  readonly rule?: string;
  /** Where the rest of this group lives, when it is bounded by a count rather than by its
   *  membership. Absent means the group is showing all of itself. */
  readonly more?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="pt-[26px] first:pt-0">
      <div className="flex items-baseline justify-between gap-3 px-[22px] pb-1">
        <div className="flex items-baseline gap-3">
          <h2 className="label-line text-accent">{label}</h2>
          {rule === undefined ? null : <p className="code-line text-dim">{rule}</p>}
        </div>
        {more === undefined ? null : (
          <a href={more} className="code-line text-accent">
            More ›
          </a>
        )}
      </div>

      {/* `divide-y divide-hair` and not a gap: this is the Hairline Rule the season list
          already draws (`episode-line.ts`'s `SEASON_LIST`), and a list of rows is the one
          place in this application it survived the linen redesign's move to cards. The
          gutter is the page's own `22px`, which the track used to bleed past. */}
      <ol className="stagger-rise divide-y divide-hair px-[22px]">{children}</ol>
    </section>
  );
}
