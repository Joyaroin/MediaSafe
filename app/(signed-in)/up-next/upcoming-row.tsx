import Link from "next/link";

import { Poster } from "@/app/poster";
import type { UpcomingEpisode } from "@/db/access";
import { episodeCode, remainingInWords } from "./episode-card-line";
import { dayMonthInWords, daysUntilInWords, type UpcomingTitle } from "./upcoming-grouping";

/**
 * One thing you are waiting for.
 *
 * ── The show is the row, and the episode is what is coming to it ────────────────────
 *
 * This used to lead with the episode: the series name set small and dim above, the
 * episode's code and name as the row's own line. That is the right emphasis on *Up next*,
 * where the question is **which episode do I watch now** and you already know the show.
 * It is the wrong one here. Upcoming answers *what am I waiting for*, and the answer is a
 * show — the episode is the date attached to it. Most of these episodes are unnamed, too:
 * TMDB announces a slot long before it announces a title, so the line that led the row was
 * frequently just a code.
 *
 * So the two swap. The show takes the row's own line, and the episode becomes the detail
 * under it beside the date.
 *
 * ── One row per show, not per episode ───────────────────────────────────────────────
 *
 * The list draws one of these per **show** (`nextPerTitle`), dated by the next episode of
 * it, with the rest of what is announced as a count. It used to draw one per episode: a
 * show with a season already scheduled — an anime dropping weekly for three months — filled
 * the whole screen with itself, nine rows of the same name and the same poster differing
 * only in a number and a date. That is a list about episodes, and this screen is about
 * what you are waiting for.
 *
 * ── And it draws the poster, because the still does not exist ───────────────────────
 *
 * The row drew `EpisodeStill`, which is the episode's own frame. Every episode on this
 * screen is **unaired** — that is the whole membership — and a still is a screenshot of
 * something nobody has seen, so TMDB nearly always has none. The result was an empty box
 * on every row of this list while Up next, made of aired episodes, drew a frame on each of
 * its own. Nothing was broken; the picture simply was not there to draw.
 *
 * The poster is what identifies the thing you are waiting for anyway, and it comes off the
 * `title` join `listUpcomingEpisodes` already makes. `app/poster.tsx` falls back to the
 * show's initials where even that is missing, so the row now has something in every case
 * rather than in almost none.
 */
export function UpcomingRow({
  episode,
  today,
  dated,
}: {
  episode: UpcomingTitle<UpcomingEpisode>;
  /** The reader's calendar day, so the row can say how far away the episode is. */
  today: string;
  /** Under *Later*, where the heading names no single day: the row sets its own date in
   *  the Meta line and its countdown on the right, in the chevron's place. */
  dated: boolean;
}) {
  const code = episodeCode(episode.seasonNo, episode.episodeNo);
  const remaining = remainingInWords(episode.more);
  const countdown = daysUntilInWords(episode.airDate, today);

  // The Meta line (Charcoal §8.2): the code, the date when the heading does not give it,
  // and how much else is announced. The episode's name is not on it — most of these are
  // unnamed slots — but it stays in what a screen reader hears.
  const meta = [code, dated ? dayMonthInWords(episode.airDate) : null, remaining]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <li className="not-last:border-b not-last:border-hair">
      <Link
        href={`/titles/${episode.libraryEntryId}`}
        className="pressable flex h-16 items-center gap-3 lg:h-[68px]"
        /* The poster is `aria-hidden` and the code is three tokens, so this is what a
           screen reader hears: the series, the episode, what else is announced, and when —
           the day heading above says when to a sighted reader. */
        aria-label={[
          episode.titleName,
          episode.episodeName === null ? code : `${code}, ${episode.episodeName}`,
          remaining,
          countdown,
        ]
          .filter((part) => part !== null)
          .join(" — ")}
      >
        {/* The Row's thumbnail: 36 by 54 on the poster corner (§4 maps the boards' 6px to
            `--radius-1`). */}
        <Poster
          posterPath={episode.posterPath}
          name={episode.titleName}
          width={36}
          className="w-9 shrink-0 [--poster-radius:var(--radius-1)]"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-row font-semibold text-text">{episode.titleName}</p>
          {/* `data-numeric` is the build's tabular-figures hook, so a column of codes and
              dates does not ripple sideways between the 4th and the 14th. */}
          <p className="truncate text-meta text-dim" data-numeric>
            {meta}
          </p>
        </div>

        {dated ? (
          <span className="shrink-0 text-meta text-dim" data-numeric>
            {countdown}
          </span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px] shrink-0 text-dim"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </Link>
    </li>
  );
}
