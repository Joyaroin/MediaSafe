import Link from "next/link";

import { airDateInWords } from "@/app/(signed-in)/library/episode-facts";
import { Poster } from "@/app/poster";
import type { UpcomingEpisode } from "@/db/access";
import { episodeCode, remainingInWords } from "./episode-card-line";
import type { UpcomingTitle } from "./upcoming-grouping";

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
export function UpcomingRow({ episode }: { episode: UpcomingTitle<UpcomingEpisode> }) {
  const code = episodeCode(episode.seasonNo, episode.episodeNo);

  return (
    <li>
      <Link
        href={`/titles/${episode.libraryEntryId}`}
        className="pressable flex items-center gap-3 rounded-[var(--radius-6)] bg-raised plate-line p-2.5"
        /* The poster is `aria-hidden` and the code is three tokens, so this is what a
           screen reader hears. The series first, because that is what a reader scanning a
           day is choosing between — and now what the row says first visually too. */
        aria-label={`${episode.titleName} — ${code}${
          episode.episodeName === null ? "" : `, ${episode.episodeName}`
        }${episode.more === 0 ? "" : `, ${remainingInWords(episode.more)}`}`}
      >
        {/* `2/3` against the still's `16/9`, so the row is taller than it was for the same
            width of artwork. `56px` keeps it close to the height it had. */}
        <Poster
          posterPath={episode.posterPath}
          name={episode.titleName}
          width={56}
          className="w-14 shrink-0 [--poster-radius:var(--radius-4)]"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-item text-ink">{episode.titleName}</p>

          {/* The code and the name on one line. Where TMDB has announced the episode
              without naming it the code stands alone rather than being followed by the
              number a second time — `CONTEXT.md`'s *an episode is never referred to by
              number alone*, which the code has already satisfied. */}
          <p className="mt-[3px] truncate text-meta text-dim">
            {episode.episodeName === null ? code : `${code} · ${episode.episodeName}`}
          </p>

          {/* The date, and how much else of this show is already announced.

              `data-numeric` is the build's tabular-figures hook, so a column of dates does
              not ripple sideways between the 4th and the 14th.

              `remainingInWords` is `up-next-episode-card.tsx`'s own phrasing — `+7
              remaining` — taken rather than reworded, so the two surfaces that count what
              is left of a show count it the same way. */}
          <p className="mt-1 flex items-baseline gap-2 code-line text-dim" data-numeric>
            <span>{airDateInWords(episode.airDate)}</span>
            {episode.more === 0 ? null : <span>{remainingInWords(episode.more)}</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}
