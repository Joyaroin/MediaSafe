"use client";

import type { LibraryState } from "@/db/access";
import { EPISODE_ROW } from "./episode-line";
import { MarkWatchedButton } from "./programme-note-episodes";
import { useWatchMark } from "./use-watch-mark";
import { WATCHED_NAME, WatchSweep } from "./watch-mark-motion";

/**
 * The film recording control — issue #90's row, in the hero's card.
 *
 * ── Where it used to live, and why it moved ─────────────────────────────────────────
 *
 * It was the film branch of `ProgrammeNoteEpisodes`: a film has no episode list, so the
 * row took that component's slot at the foot of the page. That was the right answer while
 * the episode list was the thing a film's page had instead of episodes — but it left a
 * film's **one** action below the synopsis, the watch providers and the cast, three
 * sections a reader scrolls past to reach the only thing on the page they can press.
 *
 * It sits in the hero card now, with the state line and the poster it belongs to. The
 * episode card is not rendered at all for a film (`ProgrammeNoteContent`), so nothing is
 * left behind where this used to be — an empty card would be worse than the scroll was.
 *
 * ── What did not change ──────────────────────────────────────────────────────────────
 *
 * Everything else. The same `li` shape `EpisodeLine` measured, the same sweep (issue
 * #139), the same `use-watch-mark.ts` hook driving `recordWatch` with a null `episodeId`
 * (`RecordWatchParams` was built to take one — issue #85), and the same
 * `MarkWatchedButton` the episode row and `up-next-row.tsx` draw. No `E1` chip and no
 * *Up next* label: neither concept exists for a film, and `DESIGN.md`'s Material Event
 * Rule is about the mark, not about carrying every piece of an episode row a film has no
 * source for.
 *
 * ── `state === "finished"` is *already watched*, and still is ────────────────────────
 *
 * A film is only ever *watchlist*, *finished* or *abandoned* (`CONTEXT.md`), and a watch
 * is the only write that reaches the second of those — so `state === "finished"` is
 * exactly "already watched" on mount, and a successful mark always lands on `finished` on
 * every path that can follow it. That includes a film abandoned before the control was
 * retired: `recordWatch` clears `abandoned_at` in the same transaction, `CONTEXT.md`'s
 * *"watching it again clears it"*, which is now the only way out of that state and the
 * reason the state itself is still real. So `onRecorded` patches `state` to the literal
 * `"finished"` rather than re-reading the view — there is one state a film's watch can
 * land on, so there is nothing to ask the server to resolve.
 *
 * `onStateChange` is `ProgrammeNoteContent`'s own prop, reported through `TitleHero`. It
 * was one of two callers; `AbandonControl` was the other, and this is the last one left.
 *
 * **No unwatch**, and it is a scope statement rather than a rule: issue #89 gave the
 * episode row *Rewatch* and *Unwatch*, and a film's unwatch is nobody's ticket yet.
 * Nothing here is in the way of it — `unwatch` already takes a null `episodeId` and is
 * tested for a film, and `useWatchMark` already offers it to any row that wants to draw
 * the control. What is missing is the decision and the design, not the write.
 */
export function FilmWatchRow({
  libraryEntryId,
  titleName,
  state,
  onStateChange,
}: {
  libraryEntryId: string;
  titleName: string;
  state: LibraryState;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  const { watched, phase, attempt, settle } = useWatchMark({
    initialWatched: state === "finished",
    libraryEntryId,
    episodeId: null,
    titleName,
    onRecorded: () => onStateChange(libraryEntryId, "finished"),
  });

  return (
    /* Still an `ol`/`li`, and not for markup's sake: `EPISODE_ROW` is a measured row
       treatment (`episode-line.ts`), and the row is the same row it was at the foot of the
       page. A `div` here would be the same pixels with a different reason to drift. */
    <ol>
      <li className={`relative ${EPISODE_ROW}`}>
        <span className="flex-1 text-item">
          <span className={watched && phase === "settled" ? WATCHED_NAME : ""}>{titleName}</span>
        </span>

        {watched ? (
          <span className="code-line text-dim">Watched</span>
        ) : (
          <MarkWatchedButton label={`Mark ${titleName} watched`} onClick={attempt} />
        )}

        {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
      </li>
    </ol>
  );
}
