"use client";

import type { EpisodeDetail } from "@/db/access";
import {
  EPISODE_NAME_CELL,
  EPISODE_NUMBER_UP_NEXT,
  EPISODE_ROW,
  SEASON_LIST,
} from "./episode-line";
import { MarkWatchedButton } from "./programme-note-episodes";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { episodeFullName } from "./season-grouping";
import { useWatchMark } from "./use-watch-mark";
import { WatchSweep } from "./watch-mark-motion";

/**
 * The trailing slot — this row only ever holds one of two things, the `44px`
 * `RECORDING_HIT_BOX` or the `Watched` code line, which `programme-note-episodes.tsx`'s
 * own `TRAILING` table puts a shade under `50px`. `56px` clears both with room to spare;
 * `whitespace-nowrap` on the text below is the backstop against the row growing if that
 * estimate is ever wrong. Named for the same reason every measured width in this row
 * family is (`episode-line.ts`'s own docblock) — a width buried in the JSX is a width
 * nothing stops from drifting the day this row is touched again.
 */
const TRAILING = "flex w-14 shrink-0 items-center justify-end";

/**
 * The up-next episode, markable without picking a season first — issue #228.
 *
 * `SeasonList` (`programme-note-episodes.tsx`) already defaults to the season holding this
 * same episode, but only until a reader browses another one; nothing there stays reachable
 * once they have. This row sits above the season chips instead, so the one action reached
 * for most often on this page — DESIGN.md §7's argument for the Ongoing tile, restated here
 * for its sibling surface — never depends on which season the list below happens to show.
 *
 * ── The same control, the same store ─────────────────────────────────────────────────
 *
 * `useWatchMark` is `EpisodeLine`'s own hook, over the same `libraryEntryId`/`episodeId`
 * subject — so a mark pressed here and the same episode's row in the season list below (the
 * common case, since `defaultSeason` starts there) share one optimistic mark, one key and
 * one toast by construction, exactly as `watch-marks.ts`'s own docblock promises any two
 * surfaces showing the same episode. `MarkWatchedButton` is the identical checkmark, not a
 * fourth look at the same idea.
 *
 * ── Why it disappears rather than advancing ──────────────────────────────────────────
 *
 * `episode.upNext` is a fact the server attached to one episode on this render; nothing
 * client-side recomputes *which* episode is next once this one is marked, the same
 * limitation `use-live-episodes.ts`'s `withLiveWatched` already accepts for the season list
 * (it patches `watched`, never `upNext`). So once this row's own mark settles, the honest
 * thing left to show is nothing — the true next episode is a fact only the next full read
 * has, and this row does not guess it.
 */
export function UpNextRow({
  episode,
  libraryEntryId,
  titleName,
}: {
  readonly episode: EpisodeDetail;
  readonly libraryEntryId: string;
  readonly titleName: string;
}) {
  const fullName = episodeFullName(episode);
  const { watched, phase, pending, attempt, settle } = useWatchMark({
    initialWatched: episode.watched,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
  });

  if (watched && phase === "settled") return null;

  return (
    <div className={PROGRAMME_NOTE_SECTION}>
      <p className="code-line text-dim">Up next</p>
      <ol className={SEASON_LIST}>
        <li className={`relative ${EPISODE_ROW}`}>
          <span className={EPISODE_NUMBER_UP_NEXT} data-numeric>
            E{episode.episodeNo}
          </span>

          <span className={EPISODE_NAME_CELL}>
            <span className="block truncate font-medium">
              {episode.name === null ? "Not yet named" : episode.name}
            </span>
          </span>

          <span className={TRAILING}>
            {watched ? (
              <span className="code-line whitespace-nowrap text-dim">Watched</span>
            ) : (
              <MarkWatchedButton
                label={`Mark ${fullName} watched`}
                onClick={attempt}
                disabled={pending}
              />
            )}
          </span>

          {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
        </li>
      </ol>
    </div>
  );
}
