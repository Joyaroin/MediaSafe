import Link from "next/link";

import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import { airDateInWords } from "@/app/(signed-in)/library/episode-facts";
import type { UpcomingEpisode } from "@/db/access";
import { episodeCode } from "./episode-card-line";

/**
 * One row of Upcoming — issue #251.
 *
 * `docs/design/prototypes/mediasafe-mobile.html`'s compact row, which binds the
 * appearance: an 84px 16:9 still, the series in the label register, the code and the
 * episode's name on one line, and the date under it, on the `raised` ground.
 *
 * ── There is no time of day, and there is no *time unknown* either ──────────────────
 *
 * The prototype's third line reads `21:00 · in 4 hours` or `Time unknown`. **Neither is
 * built, and this is the one place in #245 where the handoff cannot be built as drawn.**
 * TMDB publishes an air *date* for an episode and no air time at all, so *time unknown*
 * would not be an edge case on this row — it would be the only state the line ever
 * reached, on every row, forever. The row carries the date and nothing where the time
 * would be, which is the ticket's own instruction and is not an amendment anybody can make.
 *
 * `airDateInWords` is `episode-facts.ts`'s, shared rather than re-cut: it is the long
 * register (`1 March 2026`) because this row has a line to itself where the rail's card
 * shares its last line with a runtime. Both parse the date in UTC and format it in UTC,
 * because an air date is a `date` with no instant in it and the same day for every reader
 * — the grouping above this row is the only thing on the page that is in anybody's zone.
 *
 * ── A missing still holds the space rather than collapsing the row ──────────────────
 *
 * `EpisodeStill` again, at 84px. The `still` utility fixes the 16:9 ratio, so an episode
 * TMDB has no frame for keeps the row's measure and shows the `raised` ground — #245's
 * user story 48, and the same answer the rail's card gives one page over. No glyph and no
 * apology goes inside it; `app/poster.tsx` argues that at length.
 *
 * ── Where it goes ───────────────────────────────────────────────────────────────────
 *
 * The episode's own page, beneath its owning library entry (#253) — the same destination
 * the rail's card and a season row reach, so an episode behaves the same way everywhere.
 * A `Link`, because a destination is a destination.
 */
export function UpcomingRow({ episode }: { episode: UpcomingEpisode }) {
  const code = episodeCode(episode.seasonNo, episode.episodeNo);

  return (
    <li>
      <Link
        href={`/library/${episode.libraryEntryId}/episode/${episode.episodeId}`}
        className="pressable flex gap-3 rounded-2xl bg-raised p-2.5"
        /* The still is `aria-hidden` and the code is three tokens, so this is what a
           screen reader hears. The series first, because that is what a reader scanning a
           day is choosing between. */
        aria-label={`${episode.titleName} — ${code}${
          episode.episodeName === null ? "" : `, ${episode.episodeName}`
        }`}
      >
        <EpisodeStill stillPath={episode.stillPath} width={84} className="w-[84px] shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="label-line text-dim">{episode.titleName}</p>

          {/* The code and the name on one line, as the prototype draws it. Where TMDB has
              announced the episode without naming it the code stands alone rather than
              being followed by the number a second time — `CONTEXT.md`'s *an episode is
              never referred to by number alone*, which the code has already satisfied. */}
          <p className="mt-[5px] truncate text-item text-text">
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
