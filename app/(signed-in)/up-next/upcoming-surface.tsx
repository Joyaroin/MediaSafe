import type { ReactNode } from "react";

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
 * Coming up — issue #251. Page two of the landing pager until Charcoal slice 5 (#399) gave
 * it a route of its own, `coming-up/page.tsx`.
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
 * The handoff draws *Upcoming films* under these rows — the watchlist films whose release
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
  suggestions = null,
}: {
  episodes: readonly UpcomingEpisode[];
  films: readonly UpcomingFilm[];
  /** The reader's own day, `YYYY-MM-DD`, from `page.tsx`. */
  today: string;
  /** Issue #365's rail of titles to add, drawn only under the empty state. */
  suggestions?: ReactNode;
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

  if (groups.length === 0 && awaited.length === 0) {
    return <UpcomingNothing suggestions={suggestions} />;
  }

  /* `pb-6` on the wrapper rather than a node of its own: the foot of the page, held here
     because either section can be the last thing on it. */
  return (
    <div className="pb-6">
      <UpcomingEpisodes groups={groups} today={today} />
      <UpcomingFilms films={awaited} />
    </div>
  );
}

/**
 * The episodes, under their days — Charcoal §8.2. A serif Heading per day (*Today*,
 * *Tomorrow*, a weekday, *Later*) with its date on the right in Meta, and the rows beneath.
 *
 * The day headings were removed once, when each row printed its own *In 3 days* and a
 * heading saying it again was noise. The redesign moves the distance back up into the
 * heading and takes it off the row, so it is said once either way — except under *Later*,
 * which spans many days and so leaves each row its date and its countdown.
 *
 * The groups are `groupUpcoming`'s, unchanged: which day a row sits under and what the
 * heading says are that module's answers, asserted in `tests/upcoming-grouping.test.ts`.
 */
function UpcomingEpisodes({
  groups,
  today,
}: {
  groups: readonly UpcomingGroup<UpcomingTitle<UpcomingEpisode>>[];
  today: string;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col px-gutter lg:max-w-3xl">
      {groups.map((group) => {
        const headingId = `coming-up-${group.key}`;
        const later = group.date === null;

        return (
          <section key={group.key} aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between gap-3 pt-3.5 pb-1.5">
              <h2 id={headingId} className="bill-title text-bill-lg text-text">
                {group.label}
              </h2>
              {later ? null : (
                <span className="shrink-0 text-meta text-dim" data-numeric>
                  {group.date}
                </span>
              )}
            </div>

            <ul className="stagger-rise">
              {group.episodes.map((episode) => (
                <UpcomingRow
                  key={episode.episodeId}
                  episode={episode}
                  today={today}
                  dated={later}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
