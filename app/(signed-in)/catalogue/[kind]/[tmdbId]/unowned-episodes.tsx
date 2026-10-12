import type { UnownedEpisodeDetail } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import {
  EPISODE_NAME_CELL,
  EPISODE_NUMBER,
  EPISODE_ROW,
  SEASON_LIST,
} from "@/app/(signed-in)/library/episode-line";
import { PROGRAMME_NOTE_SECTION } from "@/app/(signed-in)/library/programme-note-section";
import {
  groupBySeason,
  seasonHeading,
} from "@/app/(signed-in)/library/season-grouping";

/**
 * The season/episode list for a title you do not own — issue #148.
 *
 * ── Why this is a second component and not a prop on the first ────────────────────────
 *
 * `programme-note-episodes.tsx` is a client component whose every row is a control: mark
 * watched, rewatch, unwatch, and the *Up next* chip on the one episode that is next for
 * you. All four are answers to *where are you in this*, and there is no honest answer for
 * a title you have never added — so the ticket's *no progress, no state, no up-next
 * marking* is not a set of props to pass as `false`. A row that could be told it was
 * watched is a row that will be, the first time something reads a stale detail or a
 * defaulted argument.
 *
 * The type is what enforces it rather than the review that noticed: `UnownedEpisodeDetail`
 * has no `watched` and no `upNext` to read (`db/access.ts`), so this file could not draw a
 * mark if it tried. It renders no controls, so it is a **server component** — the whole
 * page below the live facts needs no browser at all.
 *
 * What it does share is shape, through `season-grouping.ts`: the same grouping and the
 * same season headings as the owned list, because the borrowed half of the page is
 * unchanged and *Specials* is one word with one meaning.
 */
export function UnownedEpisodes({
  kind,
  episodes,
}: {
  kind: TitleKind;
  episodes: readonly UnownedEpisodeDetail[];
}) {
  /**
   * A film has no episode list. On the owned page this slot holds the film recording
   * control (issue #90); here it holds nothing, for this file's whole reason — recording
   * a watch is something you do to a title you have. The page's *Add to library* is the
   * only thing a film offers, and it is already on screen above.
   */
  if (kind === "film") return null;

  if (episodes.length === 0) {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p className="text-item text-dim">
          {/* Missing and empty stay distinct, exactly as they do on the
              owned list: this is TMDB not having handed the mirror anything, not a season
              with nothing in it. */}
          No episode data yet.
        </p>
      </div>
    );
  }

  return (
    <>
      {groupBySeason(episodes).map(([seasonNo, inSeason]) => (
        // No chips here — every season is listed in turn — so each is headed in the serif
        // at Heading size, `h3` under the page's hidden *Episodes* `h2` (Charcoal §12).
        // `first:mt-1` because the first sits right under the synopsis.
        <div key={seasonNo} className={`${PROGRAMME_NOTE_SECTION} first:mt-1`}>
          <h3 className="bill-title text-bill-lg text-text">{seasonHeading(seasonNo)}</h3>
          <ol className={SEASON_LIST}>
            {inSeason.map((one) => (
              /* The row's measure is `episode-line.ts`'s, shared with the owned list
                 rather than copied from it: those numbers are a measurement
                 (`programme-note-episodes.tsx` records how), and a second copy of them is
                 a row nobody measured. */
              <li key={one.id} className={EPISODE_ROW}>
                <span className={EPISODE_NUMBER} data-numeric>
                  {one.episodeNo}
                </span>

                {/* The Named Episode Rule: an episode is always its name.
                    `null` is TMDB not having named it yet — not a licence to print the
                    number a second time in its place. Never dimmed, never struck: the
                    dimmed name means *watched* on the owned list, and there is nobody
                    here it could be watched by. */}
                <span className={EPISODE_NAME_CELL}>
                  <span className="block truncate">
                    {one.name === null ? "Not yet named" : one.name}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}
