import Link from "next/link";

import { airDateInWords } from "@/app/(signed-in)/library/episode-facts";
import { Poster } from "@/app/poster";
import type { UpcomingEpisode } from "@/db/access";
import { episodeCode } from "./episode-card-line";

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
export function UpcomingRow({ episode }: { episode: UpcomingEpisode }) {
  const code = episodeCode(episode.seasonNo, episode.episodeNo);

  return (
    <li>
      <Link
        href={`/library/${episode.libraryEntryId}/episode/${episode.episodeId}`}
        className="pressable flex items-center gap-3 rounded-2xl bg-raised p-2.5"
        /* The poster is `aria-hidden` and the code is three tokens, so this is what a
           screen reader hears. The series first, because that is what a reader scanning a
           day is choosing between — and now what the row says first visually too. */
        aria-label={`${episode.titleName} — ${code}${
          episode.episodeName === null ? "" : `, ${episode.episodeName}`
        }`}
      >
        {/* `2/3` against the still's `16/9`, so the row is taller than it was for the same
            width of artwork. `56px` keeps it close to the height it had. */}
        <Poster
          posterPath={episode.posterPath}
          name={episode.titleName}
          width={56}
          className="w-14 shrink-0 [--poster-radius:10px]"
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

          {/* `data-numeric` is the build's tabular-figures hook, so a column of dates does
              not ripple sideways between the 4th and the 14th. */}
          <p className="mt-1 code-line text-dim" data-numeric>
            {airDateInWords(episode.airDate)}
          </p>
        </div>
      </Link>
    </li>
  );
}
