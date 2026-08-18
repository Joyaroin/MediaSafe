"use client";

import { useRef, useState } from "react";

import type { EpisodeDetail } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { recordWatchAction } from "./watch-action";

/**
 * The season/episode list — the row that carries the product's most important rule
 * (`DESIGN.md`, Episode Line). Shared verbatim by the desktop pane and the phone route,
 * because #58's episode list is one design at two densities, not one of the three genuine
 * divergences (`docs/design/v1-surfaces.md` §5).
 *
 * The whole file is a client boundary now — issue #88 puts the recording control here,
 * and `ProgrammeNoteContent`, its own server-component caller, stays exactly that: the
 * phone route renders it unguarded, the desktop pane inside its own client shell, and
 * either way this is the one place that needs the browser.
 */
export function ProgrammeNoteEpisodes({
  kind,
  episodes,
  libraryEntryId,
  titleName,
}: {
  kind: TitleKind;
  episodes: readonly EpisodeDetail[];
  libraryEntryId: string;
  titleName: string;
}) {
  // A film has no seasons. Nothing renders — not even the "no episode data" line, which
  // is a show's honest answer to a question a film was never asked.
  if (kind === "film") return null;

  if (episodes.length === 0) {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p className="text-item text-stock-dim">
          {/*
            Missing and empty stay distinct here as everywhere (`CONTEXT.md`): this is not
            "a season with nothing in it", which would be a `library_entry` bug — it is
            TMDB not having handed the mirror anything yet, and the honest way to say that
            is a sentence, not a season heading over zero rows.
          */}
          No episode data yet.
        </p>
      </div>
    );
  }

  return (
    <>
      {groupBySeason(episodes).map(([seasonNo, inSeason]) => (
        <div key={seasonNo} className={PROGRAMME_NOTE_SECTION}>
          <p className="code-line text-stock-dim">
            {seasonNo === 0 ? "Specials" : `Season ${seasonNo}`}
          </p>
          <ol className="mt-3 divide-y divide-rule">
            {inSeason.map((one) => (
              <EpisodeLine
                key={one.id}
                episode={one}
                libraryEntryId={libraryEntryId}
                titleName={titleName}
              />
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

/** Episodes arrive from `getTitleDetail` already ordered `(season_no, episode_no)`, so a
 *  `Map`'s insertion order is the season order — nothing here re-sorts. */
function groupBySeason(
  episodes: readonly EpisodeDetail[],
): readonly (readonly [number, EpisodeDetail[]])[] {
  const bySeason = new Map<number, EpisodeDetail[]>();
  for (const one of episodes) {
    const inSeason = bySeason.get(one.seasonNo);
    if (inSeason) inSeason.push(one);
    else bySeason.set(one.seasonNo, [one]);
  }
  return [...bySeason.entries()];
}

/** `CONTEXT.md`: an episode is never referred to by number alone. The season word matches
 *  whichever heading this episode is grouped under above — `Specials`, not `Season 0`. */
function episodeFullName(episode: EpisodeDetail): string {
  const season = episode.seasonNo === 0 ? "Specials" : `Season ${episode.seasonNo}`;
  const name = episode.name === null ? "Not yet named" : episode.name;
  return `${season}, Episode ${episode.episodeNo} — ${name}`;
}

/**
 * `DESIGN.md`, Episode Line: `E1` as a dim, fixed-width, tabular code line; the episode
 * **name** at `text-item` as the actual content; a trailing state code line. Watched
 * episodes are struck through in dim bone; the up-next episode inverts its number into a
 * solid vermilion chip and carries a vermilion *Up next* label.
 *
 * ── The three phases of one row ───────────────────────────────────────────────────────
 *
 * `unwatched` → `marking` → `settled`, and an already-watched episode from the server
 * mounts straight into `settled` — no animation plays for a mark that happened before
 * this page loaded. Only a fresh press runs `unwatched` → `marking` → `settled`.
 *
 * `watched` (the optimistic flag) and `phase` are deliberately two different pieces of
 * state. `watched` flips the instant the row is touched — the button disappears and the
 * trailing label reads *Watched* immediately, which is what "marks the episode
 * immediately, before the server has answered" means. `phase` governs only the strike and
 * the stamp: while it is `marking`, the *animated* rule and stamp play and the *static*
 * `line-through` is suppressed, so the two never render on top of each other. `phase`
 * reaches `settled` on the strike's own `onAnimationEnd` — the longer of the two motions
 * (`420ms` against the stamp's `280–380ms`) — at which point the row falls back to
 * exactly the static, already-watched appearance this file rendered before this ticket.
 *
 * ── The bounding rect ──────────────────────────────────────────────────────────────────
 *
 * The strike and the stamp are both `position: absolute` (`app/globals.css`'s
 * `watch-strike` / `watch-stamp` utilities) inside `relative` containers, so neither
 * takes up flow space. What *is* in flow, and does change between the two states, is the
 * recording control itself: it disappears the instant `watched` flips, and its own box
 * (border, `0.25rem`/`0.625rem` padding) is taller than the plain code-line text either
 * side of it renders on its own. Left alone, that shrinks the row by a fraction of a
 * pixel the moment the button goes — measured, not assumed, and it did not pass the first
 * time: `min-h-[1.375rem]`, sized to the button's padding box alone, still let the row
 * settle about `0.6px` shorter once the button was gone, because Tailwind's preflight box
 * -sizing means `min-height` competes with the *taller* of the row's two states, not the
 * control alone. `min-h-11` (`2.75rem`, Tailwind's own step — not an arbitrary value) is
 * sized to comfortably clear the row's own tallest natural content (name line + `py-2.5`)
 * instead, which is what actually dominates, and pinning to that clamps both states to
 * the same number.
 *
 * Re-measured against the compiled CSS in a real Chromium tab (`getBoundingClientRect`),
 * not assumed from the class names: `x`, `y`, `width` and `height` were identical —
 * `44px` tall at a `420px` pane width — across all three phases (button showing, mid
 * -strike, settled), and held at a `340px` phone width and with the *Up next* label
 * present alongside the control too.
 *
 * ── Idempotency, minted once ─────────────────────────────────────────────────────────
 *
 * `key` is a ref, set on the first press and reused for every retry of that same click —
 * `db/access.ts`'s `recordWatch` is what makes a repeated key a no-op rather than a
 * second watch, and it can only do that if this never mints a second key for a write that
 * has not yet succeeded.
 */
function EpisodeLine({
  episode,
  libraryEntryId,
  titleName,
}: {
  episode: EpisodeDetail;
  libraryEntryId: string;
  titleName: string;
}) {
  const [watched, setWatched] = useState(episode.watched);
  const [phase, setPhase] = useState<"unwatched" | "marking" | "settled">(
    episode.watched ? "settled" : "unwatched",
  );
  const key = useRef<string | null>(null);
  const raised = useRef<WriteFailureHandle | null>(null);

  /**
   * A function declaration, not `useCallback`, for the reason `catalogue-result.tsx`
   * gives its own `attempt`: it hands itself to the toast as `retry`, and closes over
   * nothing that changes across the life of this row.
   */
  async function attempt(): Promise<void> {
    if (key.current === null) key.current = crypto.randomUUID();

    setWatched(true);
    setPhase("marking");

    const outcome = await record(key.current);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      raised.current?.resolve();
      raised.current = null;
      return;
    }

    setWatched(false);
    setPhase("unwatched");

    // One toast per lost write, not one per attempt.
    if (raised.current) return;

    raised.current = writeFailures.raise({
      title: titleName,
      episode: episodeFullName(episode),
      reference: outcome.reference,
      retry: () => void attempt(),
    });
  }

  /**
   * The one failure `recordWatchAction` cannot report itself, turned into the same
   * outcome shape: the request never reaching the server at all. `catalogue-result.tsx`'s
   * `add()` is the same wrapper for the same reason — React strips a thrown Server
   * Action's error before it crosses to the browser, so this is what lets `referenceFor`
   * see the real one.
   */
  async function record(sourceKey: string) {
    try {
      return await recordWatchAction({
        libraryEntryId,
        episodeId: episode.id,
        sourceKey,
      });
    } catch (error) {
      return {
        ok: false as const,
        reference: referenceFor(error, { surface: "record-watch" }),
      };
    }
  }

  return (
    <li className="relative flex min-h-11 items-center gap-3 py-2.5">
      <span
        className={
          episode.upNext && !watched
            ? "code-line w-9 shrink-0 bg-signal px-1 py-0.5 text-center text-ink"
            : "code-line w-9 shrink-0 text-stock-dim"
        }
        data-numeric
      >
        E{episode.episodeNo}
      </span>

      {/* The Named Episode Rule (`DESIGN.md`): an episode is always its name. `null` is
          TMDB not having named it yet — not a licence to print the number a second time
          in its place. */}
      <span className="relative flex-1 text-item">
        <span
          className={
            watched && phase === "settled"
              ? "text-stock-dim line-through decoration-2 decoration-signal"
              : episode.upNext && !watched
                ? "font-medium"
                : ""
          }
        >
          {episode.name === null ? "Not yet named" : episode.name}
        </span>

        {phase === "marking" ? (
          <span className="watch-strike" aria-hidden onAnimationEnd={() => setPhase("settled")} />
        ) : null}
      </span>

      {watched ? (
        <span className="code-line text-stock-dim">Watched</span>
      ) : (
        <span className="flex shrink-0 items-center gap-3">
          {episode.upNext ? <span className="code-line text-signal">Up next</span> : null}
          <button
            type="button"
            onClick={() => void attempt()}
            aria-label={`Mark ${episodeFullName(episode)} watched`}
            className="code-line border border-signal px-2.5 py-1 text-signal transition-colors duration-150 hover:bg-signal hover:text-ink"
          >
            Strike it
          </button>
        </span>
      )}

      {phase === "marking" ? (
        <span className="watch-stamp code-line" aria-hidden>
          Watched
        </span>
      ) : null}
    </li>
  );
}
