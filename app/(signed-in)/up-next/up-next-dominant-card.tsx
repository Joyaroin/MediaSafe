"use client";

import Link from "next/link";

import type { UpNextEntry } from "@/db/access";
import { Plate } from "@/app/plate";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { AbandonControl } from "../library/abandon-control";
import { useWatchMark } from "../library/use-watch-mark";
import { STRUCK_NAME, WatchStamp, WatchStrike } from "../library/watch-mark-motion";

/**
 * The scene this whole product was shaped around — `docs/design/v1-surfaces.md`: *an
 * episode has just ended. Phone. Half attention, credits rolling, TV still on. Record the
 * watch and put the phone down.*
 *
 * ── Reused, not rebuilt ────────────────────────────────────────────────────────────────
 *
 * `useWatchMark`, `WatchStrike`/`WatchStamp` and `AbandonControl` are imported from
 * `../library/` unchanged — issue #87's own docblock calls this exact placement out by
 * name (*"a future Up next card … is free to do something else entirely, which is what
 * makes this reusable there"*), and the abandon control's own section in `DESIGN.md` says
 * it appears in exactly two places.
 *
 * This used to say moving all three into a shared location was #103's job once the desktop
 * row (#100) existed. **#103 moved none of them**, and the anticipation was the wrong shape
 * for what it turned out to be about: the collision it closes is two surfaces holding two
 * optimistic states for one episode, so what moved was the *state*, out of the hook and
 * into `../library/watch-marks.ts`, keyed by episode. The three imports above are still
 * three imports from `../library/`, and this card is unchanged by that ticket.
 *
 * `initialWatched` is always `false`: `listUpNext` only ever returns a *watching* title's
 * unwatched next episode (`db/access.ts`), so there is no server-known watched state to
 * seed this with — the row starts unwatched and a press is the only way it changes for
 * the life of this page load, matching *"a title that leaves watching does not vanish
 * mid-interaction"* below.
 *
 * ── The recording control's bounding box never changes ───────────────────────────────
 *
 * One `<button>`, always present at the same padding and border regardless of `watched` —
 * its label is the only thing that changes. `DESIGN.md`'s Motion section asks for the
 * entry's rect to hold before and after a mark; swapping the button out for a different
 * element once watched would be exactly the kind of reflow that rule exists to prevent.
 *
 * ── Neither write removes the card ────────────────────────────────────────────────────
 *
 * Marking watched flips `watched` in place — same struck name, same trailing "Watched" —
 * and giving up hands the write to `AbandonControl`, which does the same in its own row.
 * Neither one removes this entry from `UpNextSurface`'s array: a title that leaves
 * *watching* is gone from the deck on the *next* load of this route, not out from under a
 * thumb still resting on it.
 */
export function UpNextDominantCard({ entry }: { entry: UpNextEntry }) {
  // The on-screen label, in the dominant card's own spelled-out form — taken from
  // `docs/design/prototypes/repertory-bill.html`'s hero card rather than re-derived, and
  // deliberately not the compact deck's abbreviated "S1 E2" (`up-next-deck-row.tsx`): the
  // two are different surfaces at different densities, the same way the bill grid and the
  // desktop Up next row already print two different code lines for the same fact.
  const episodeLabel = `Season ${entry.seasonNo} · Episode ${entry.episodeNo}`;
  const episodeName = entry.episodeName ?? "Not yet named";
  // The toast/aria text, in `programme-note-episodes.tsx`'s `episodeFullName` convention
  // (comma, not the middot above) — this is what a lost-write toast actually prints, and
  // it should read the same sentence whatever surface lost the write.
  const toastEpisodeName = `Season ${entry.seasonNo}, Episode ${entry.episodeNo} — ${episodeName}`;

  const { watched, phase, pending, attempt, settle } = useWatchMark({
    initialWatched: false,
    libraryEntryId: entry.libraryEntryId,
    episodeId: entry.episodeId,
    titleName: entry.titleName,
    episodeName: toastEpisodeName,
  });

  return (
    <article className="relative flex flex-col border-t border-hair">
      <Link href={`/library/${entry.libraryEntryId}`} className="flex flex-col">
        <Plate posterPath={entry.posterPath} className="aspect-[5/4] w-full shrink-0" />

        <div className="flex shrink-0 gap-4 px-4 py-4">
          <div className="relative min-w-0 flex-1">
            <h2 className="bill-title break-words text-bill-lg">{entry.titleName}</h2>

            <div className="relative mt-2 inline-block max-w-full pr-1">
              <span
                className={`block truncate text-bill-xs font-medium leading-tight ${
                  watched && phase === "settled" ? STRUCK_NAME : ""
                }`}
              >
                {episodeName}
              </span>

              {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
            </div>

            <p className="code-line mt-1.5 text-dim" data-numeric>
              {episodeLabel}
            </p>

            {phase === "marking" ? <WatchStamp /> : null}
          </div>
        </div>
      </Link>

      {/* `AbandonControl` carries no horizontal padding of its own —
          `programme-note-content.tsx`'s `px-6 py-5` wrapper is what gives it that there,
          and this is the second of the two places `DESIGN.md` says it appears. */}
      <div className="px-4">
        <AbandonControl
          libraryEntryId={entry.libraryEntryId}
          titleName={entry.titleName}
          abandoned={false}
          // Nothing to patch here: the row stays on screen either way (see the docblock
          // above), and `AbandonControl` already carries its own optimistic "Take it
          // back" state without this callback's help.
          onChanged={() => {}}
        />
      </div>

      <button
        type="button"
        onClick={() => void attempt()}
        disabled={pending || watched}
        aria-label={
          watched
            ? `${entry.titleName}, ${episodeLabel} watched`
            : `Mark ${entry.titleName}, ${episodeLabel} watched`
        }
        className={`flex w-full shrink-0 items-center justify-center gap-3 border-t-2 border-accent bg-accent py-5 text-accent-ink transition-[filter] duration-200 active:brightness-90 ${IN_FLIGHT}`}
      >
        {watched ? (
          <span className="code-line">Watched</span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <rect x="2" y="10.5" width="20" height="3" fill="currentColor" />
            </svg>
            <span className="code-line">Strike it — mark watched</span>
          </>
        )}
      </button>
    </article>
  );
}
