"use client";

import { Poster } from "@/app/poster";
import type { UpNextEntry } from "@/db/access";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { useWatchMark } from "./use-watch-mark";
import { RECORDING_CONTROL, WatchStamp, WatchStrike } from "./watch-mark-motion";

/**
 * TONIGHT's grid — the desktop Up next row, issue #100 over `db/access.ts`'s `listUpNext`
 * (#98) and `use-watch-mark.ts`'s optimistic hook (#88/#89). Split from `up-next-row.tsx`
 * for the same reason `programme-note-episodes.tsx` is split from `programme-note.tsx`:
 * this takes `entries` as a plain prop and imports nothing that reaches the network, so it
 * is the seam `tests/up-next-grid.test.ts` renders directly.
 *
 * `DESIGN.md`, Up Next Row (desktop): *an auto-fill grid, not a scroller. Cards are
 * `minmax(292px, 1fr)` on `1px` gaps over `bg-hair`, `0.75rem` padding, ground `ground`, and
 * the whole row is capped at `max-height: 122px` with `overflow: hidden` so exactly one
 * row of whole cards renders.* Every class below is that sentence — there is no second
 * breakpoint here, no scroller and no numeric cap on how many entries are passed in. The
 * clip is what bounds what shows, not a `.slice()` on `entries`: an ultrawide viewport
 * simply fits more columns before the same `122px` cuts the next row off.
 */
export function UpNextGrid({
  entries,
  headingId,
}: {
  entries: readonly UpNextEntry[];
  /**
   * `up-next-row.tsx`'s *Tonight* heading id, the same device `LibraryGrid` uses to point
   * at `LibraryHeading` — a prop here rather than an imported constant, unlike that pair.
   * `LibraryGrid` imports `LIBRARY_HEADING_ID` because `LibraryHeading` never imports
   * `LibraryGrid` back; `up-next-row.tsx` already imports `UpNextGrid`, so importing the
   * id the other way would be a circular module dependency between the two. The prop also
   * keeps this component's own render tests (`tests/up-next-grid.test.ts`) free of a
   * hard-coded string that would drift from whatever `up-next-row.tsx` actually renders.
   */
  headingId: string;
}) {
  return (
    <ol
      aria-labelledby={headingId}
      className="grid max-h-[122px] grid-cols-[repeat(auto-fill,minmax(292px,1fr))] gap-px overflow-hidden bg-hair"
    >
      {entries.map((entry) => (
        <UpNextCard key={entry.libraryEntryId} entry={entry} />
      ))}
    </ol>
  );
}

/**
 * `CONTEXT.md`: an episode is never referred to by number alone. The card's dim `S1 E2`
 * line sits beside the name, never in place of it — the same rule
 * `programme-note-episodes.tsx`'s `episodeFullName` holds, restated for the toast this
 * card's mark can raise.
 */
function upNextEpisodeName(entry: UpNextEntry): string {
  return entry.episodeName === null ? "Not yet named" : entry.episodeName;
}

function upNextEpisodeFullName(entry: UpNextEntry): string {
  const season = entry.seasonNo === 0 ? "Specials" : `Season ${entry.seasonNo}`;
  return `${season}, Episode ${entry.episodeNo} — ${upNextEpisodeName(entry)}`;
}

/**
 * Each card is a poster beside a `text-bill-sm` title, a truncated episode name at
 * `text-item`, a dim `S1 E2` code line, and a ghost Strike it button pushed to the bottom
 * with `mt-auto`. The strike rule and Watched stamp are positioned inside the card's
 * right-hand block.
 *
 * The poster is `92px` tall, not wide — before #135 it was a fixed `69×92px` plate; the
 * row's `max-h-[122px]` clip is the real constraint here, so height stays fixed and the
 * `poster` utility's `2/3` ratio derives the (narrower) width from it, rather than the
 * other way round.
 *
 * The title truncates alongside the episode name for the reason
 * `programme-note-episodes.tsx`'s `TRAILING` docblock gives generally: the card's height
 * is fixed by the poster and the clip above it, so a name that wraps is a name that grows
 * the row rather than a name that reads on one line.
 *
 * Marking here is the exact hook `EpisodeLine` drives — no second write, no second
 * idempotency, no second rollback (issue #100's own acceptance criteria). **And the same
 * write, not merely the same code**: this row and the programme note are on screen at
 * once, so a card and an episode line showing the same episode share one mark in
 * `watch-marks.ts` (issue #103). Marking from either records one watch, a failure raises
 * one toast, and both go struck together. A struck card
 * keeps its *Watched* label rather than disappearing: this row loads once per page view
 * (`up-next-row.tsx`), so the card leaving the deck is a fact of the *next* load, and a
 * card that vanished immediately would be gone out from under a cursor still resting on
 * it.
 */
function UpNextCard({ entry }: { entry: UpNextEntry }) {
  const fullName = upNextEpisodeFullName(entry);
  const { watched, phase, pending, attempt, settle } = useWatchMark({
    initialWatched: false,
    libraryEntryId: entry.libraryEntryId,
    episodeId: entry.episodeId,
    titleName: entry.titleName,
    episodeName: fullName,
  });

  return (
    <li className="flex gap-3 bg-ground p-3">
      <Poster posterPath={entry.posterPath} width={61} className="h-[92px] shrink-0" />

      {/* `WatchStamp`'s own relative container — the card's right-hand block, offset to
          its trailing edge, the same role `programme-note-episodes.tsx`'s `<li>` plays
          for the episode row (`watch-mark-motion.tsx`'s docblock). */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* `WatchStrike`'s own tight relative wrapper — the struck name it scales in
            over, not the whole block. Sharing `WatchStamp`'s wider container would put
            the strike's `top: 50%` line across the stacked title/episode/code lines
            rather than through the title itself. */}
        <span className="relative block">
          <p className="bill-title truncate text-bill-sm text-text">{entry.titleName}</p>
          {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
        </span>

        <p className="mt-1 truncate text-item text-dim">
          {upNextEpisodeName(entry)}
        </p>

        <p className="code-line mt-1 text-dim" data-numeric>
          S{entry.seasonNo} E{entry.episodeNo}
        </p>

        {!watched ? (
          <button
            type="button"
            onClick={() => void attempt()}
            disabled={pending}
            aria-label={`Mark ${fullName} watched`}
            className={`${RECORDING_CONTROL} mt-auto w-fit ${IN_FLIGHT}`}
          >
            Strike it
          </button>
        ) : (
          <span className="code-line mt-auto text-dim">Watched</span>
        )}

        {phase === "marking" ? <WatchStamp /> : null}
      </div>
    </li>
  );
}
