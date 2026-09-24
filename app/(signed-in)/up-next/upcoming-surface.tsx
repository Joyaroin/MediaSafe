import type { UpcomingEpisode, UpcomingFilm } from "@/db/access";
import {
  awaitedFilms,
  groupUpcoming,
  nextPerTitle,
  type UpcomingGroup,
  type UpcomingTitle,
} from "./upcoming-grouping";
import { UpcomingFilms } from "./upcoming-films";
import { UpcomingNothing } from "./upcoming-nothing";
import { UpcomingRow } from "./upcoming-row";

/**
 * Page two of the landing pager — issue #251.
 *
 * The future-dated episodes of the shows standing at **Watching or Caught up**, grouped by
 * Today, Tomorrow, a named weekday and Later, in the reader's own timezone.
 *
 * ── A server component, and the grouping happens here rather than in the read ────────
 *
 * `listUpcomingEpisodes` returns dated rows over a window a day wider than the server's own
 * day; `groupUpcoming` narrows that to the reader's actual today and writes the headings.
 * The split is #245's instruction — *grouping is a pure module beside the read, taking the
 * zone and the current day as arguments rather than reading a clock* — and it is what makes
 * the one failure this ticket is about assertable: a grouping wrong by one timezone is
 * wrong forever and looks entirely correct.
 *
 * `today` is a prop rather than a `new Date()` here, for the same reason one level further
 * out. `page.tsx` is the one place on this route that reads a clock, and it reads it once,
 * against `requireTimezone()`.
 *
 * ── The films arrived in #252, and this component is what adds the halves up ────────
 *
 * The handoff draws *Upcoming movies* under these rows — the watchlist films whose release
 * date is still ahead, with a countdown. #252 built them over their own read
 * (`listUpcomingFilms`) and their own section (`upcoming-films.tsx`), and what lands here
 * is the one thing neither half can decide alone: **whether the page is empty**.
 *
 * Each section is absent on nothing, which is *an empty rail is absent* — no
 * heading over no rows. But
 * *no release dates yet* is a claim about the whole page, and a reader with three dated
 * episodes and no dated film is not looking at an empty Upcoming. So the sentence is drawn
 * here, from both counts, and neither section is allowed to draw one of its own. **The
 * order is the handoff's** — episodes first, films under them — and neither half reserves
 * space for the other, so a page with only films starts at the films.
 *
 * The two halves narrow their own reads to the reader's today, against the same `today`
 * this component is handed: `groupUpcoming` drops what has aired and `awaitedFilms` drops
 * what has come out. Both reads deliberately return a day more than either needs
 * (`db/access.ts` argues why), so *empty* here means *empty in the reader's zone* rather
 * than *empty in UTC* — which is the difference between the sentence being true and the
 * sentence being true for whoever wrote it.
 *
 * ── Empty and failed, kept apart ────────────────────────────────────────────────────
 *
 * Nothing on either half is the handoff's sentence (`UpcomingNothing`), and it is reachable
 * only from reads that succeeded. A failure throws past this into the route's `error.tsx`,
 * which draws the inline read-failure treatment with a reference id. This is the screen
 * `AGENTS.md`'s rule was written about, one page along from where it was written — and
 * #252 doubles the surface it applies to: a films section absent because the database is
 * down reads exactly like a watchlist with nothing dated on it.
 */
export function UpcomingSurface({
  episodes,
  films,
  today,
}: {
  episodes: readonly UpcomingEpisode[];
  films: readonly UpcomingFilm[];
  /** The reader's own day, `YYYY-MM-DD`, from `page.tsx`. */
  today: string;
}) {
  /**
   * Collapsed to one entry per show **before** grouping by day, so a show lands on the day
   * of its next episode rather than on every day it has one announced.
   *
   * The order matters. Grouping first and collapsing inside each day would still show
   * *JoJo's Bizarre Adventure* nine times — once per week it airs — which is the bug
   * exactly. Collapsing first is what makes this a list of shows.
   */
  const groups = groupUpcoming(nextPerTitle(episodes), today);
  const awaited = awaitedFilms(films, today);

  if (groups.length === 0 && awaited.length === 0) return <UpcomingNothing />;

  /* `pb-2` on the wrapper rather than a node of its own: the foot of a page that scrolls
     under a pager, held here now that either section can be the last thing on it. */
  return (
    <div className="pb-2">
      <UpcomingEpisodes groups={groups} />
      <UpcomingFilms films={awaited} />
    </div>
  );
}

/**
 * The episodes half, lifted out of the surface unchanged when #252 gave it a sibling.
 *
 * Absent on nothing rather than empty-headed, which is what lets the films below stand
 * alone for a reader who keeps a watchlist and is between series. The sentence for *both*
 * halves empty is the surface's, above.
 */
function UpcomingEpisodes({
  groups,
}: {
  groups: readonly UpcomingGroup<UpcomingTitle<UpcomingEpisode>>[];
}) {
  if (groups.length === 0) return null;

  return (
    <section className="pt-[26px]">
      {/* The rail heads' register on page one, held here so the two pages read as one
          screen — `up-next-phone-rail.tsx`'s `RailSection` draws its own head exactly this
          way, and its docblock carries the accent argument for both.

          A heading and never a count: *no counts on a rail head* is the
          half of the old *no counts, anywhere* that #250 **kept** rather than narrowed,
          and this head is squarely inside it. */}
      <div className="px-[22px] pb-1">
        <h2 className="label-line text-accent">Upcoming episodes</h2>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="px-[22px] pt-4">
          {/* The day's own heading, in the body register rather than the label one, because
              it is the thing a reader scans for. `Today` and `Tomorrow` are words and a
              weekday is a name; none of the four is a date, which is what each row carries
              for itself. */}
          <h3 id={`upcoming-${group.key}`} className="text-item font-semibold text-text">
            {group.label}
          </h3>

          <ul
            aria-labelledby={`upcoming-${group.key}`}
            className="stagger-rise mt-2.5 flex flex-col gap-2"
          >
            {group.episodes.map((episode) => (
              <UpcomingRow key={episode.episodeId} episode={episode} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
