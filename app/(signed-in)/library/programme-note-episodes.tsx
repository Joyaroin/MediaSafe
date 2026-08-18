"use client";

import type { EpisodeDetail, LibraryState } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { useWatchMark } from "./use-watch-mark";
import { WatchStamp, WatchStrike } from "./watch-mark-motion";

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
 *
 * ── The film branch ────────────────────────────────────────────────────────────────────
 *
 * A film has no seasons, so this was `kind === "film" ? null : …` in full through #88 —
 * "the correct answer to a question a film was never asked", and also, per #90, "where
 * this control belongs": the film recording control replaces that `null` rather than
 * sitting beside it. `episodes` is still ignored for a film (there are none to ignore),
 * and no season heading, no "no episode data" line and no `<ol>` of one row's worth of
 * seasons ever renders here — only `FilmRow`, in the same `PROGRAMME_NOTE_SECTION` rhythm
 * a season heading would have used.
 */
export function ProgrammeNoteEpisodes({
  kind,
  episodes,
  libraryEntryId,
  titleName,
  state,
  onStateChange,
}: {
  kind: TitleKind;
  episodes: readonly EpisodeDetail[];
  libraryEntryId: string;
  titleName: string;
  state: LibraryState;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  if (kind === "film") {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <ol>
          <FilmRow
            libraryEntryId={libraryEntryId}
            titleName={titleName}
            state={state}
            onStateChange={onStateChange}
          />
        </ol>
      </div>
    );
  }

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
 * The strike and the stamp are both `position: absolute` (`watch-mark-motion.tsx`'s
 * `WatchStrike` / `WatchStamp`, `app/globals.css`'s `watch-strike` / `watch-stamp`
 * utilities) inside `relative` containers, so neither takes up flow space. What *is* in
 * flow, and does change between the two states, is the recording control itself: it
 * disappears the instant `watched` flips, and its own box (border, `0.25rem`/`0.625rem`
 * padding) is taller than the plain code-line text either side of it renders on its own.
 * Left alone, that shrinks the row by a fraction of a pixel the moment the button goes —
 * measured, not assumed, and it did not pass the first time: `min-h-[1.375rem]`, sized to
 * the button's padding box alone, still let the row settle about `0.6px` shorter once the
 * button was gone, because Tailwind's preflight box-sizing means `min-height` competes
 * with the *taller* of the row's two states, not the control alone. `min-h-11`
 * (`2.75rem`, Tailwind's own step — not an arbitrary value) is sized to comfortably clear
 * the row's own tallest natural content (name line + `py-2.5`) instead, which is what
 * actually dominates, and pinning to that clamps both states to the same number.
 *
 * Re-measured against the compiled CSS in a real Chromium tab (`getBoundingClientRect`),
 * not assumed from the class names: `x`, `y`, `width` and `height` were identical —
 * `44px` tall at a `420px` pane width — across all three phases (button showing, mid
 * -strike, settled), and held at a `340px` phone width and with the *Up next* label
 * present alongside the control too. `FilmRow` below reuses this exact `li` shape for the
 * same reason — a row that resizes when it succeeds is still a row that moves under a
 * thumb still resting on it, whether the row is an episode's or a film's.
 *
 * ── Idempotency, minted once ─────────────────────────────────────────────────────────
 *
 * `use-watch-mark.ts`'s `key` is a ref, set on the first press and reused for every retry
 * of that same click — `db/access.ts`'s `recordWatch` is what makes a repeated key a
 * no-op rather than a second watch, and it can only do that if this never mints a second
 * key for a write that has not yet succeeded.
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
  const { watched, phase, attempt, settle } = useWatchMark({
    initialWatched: episode.watched,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: episodeFullName(episode),
  });

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

        {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
      </span>

      {watched ? (
        <span className="code-line text-stock-dim">Watched</span>
      ) : (
        <span className="flex shrink-0 items-center gap-3">
          {episode.upNext ? <span className="code-line text-signal">Up next</span> : null}
          <MarkWatchedButton label={`Mark ${episodeFullName(episode)} watched`} onClick={attempt} />
        </span>
      )}

      {phase === "marking" ? <WatchStamp /> : null}
    </li>
  );
}

/**
 * The film recording control — issue #90. A film has no episode list, so this is the row
 * that occupies its slot instead: the same `li` shape `EpisodeLine` measured, the same
 * strike-and-stamp, the same `use-watch-mark.ts` hook, driving `recordWatch` with a null
 * `episodeId` (`RecordWatchParams` was built to take one — issue #85). No `E1` chip and no
 * *Up next* label: neither concept exists for a film, and `DESIGN.md`'s Material Event
 * Rule is about the mark, not about carrying every piece of an episode row that a film has
 * no source for.
 *
 * A film is only ever *watchlist*, *finished* or *abandoned* (`CONTEXT.md`), and a watch
 * is the only write that reaches the second of those — so `state === "finished"` is
 * exactly "already watched" on mount, and a successful mark always lands on `finished` on
 * every path that can follow it (including an abandoned film: `recordWatch` clears
 * `abandoned_at` in the same transaction, `CONTEXT.md`'s "watching it again clears it").
 * That is why `onRecorded` here patches `state` to the literal `"finished"` instead of
 * re-reading the view the way `AbandonControl`'s `unabandonTitle` does — there is only one
 * state a film's watch can land on, so there is nothing this needs to ask the server to
 * resolve. `onStateChange` is `ProgrammeNoteContent`'s own prop, the same one
 * `AbandonControl` already reports through, so both the state line on this page and the
 * next full read agree.
 *
 * No undo: neither `EpisodeLine` above nor this row offers one, because none exists on
 * this surface yet for an episode either — #88 did not add one, so this does not invent a
 * second, different rule for a film.
 */
function FilmRow({
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
    <li className="relative flex min-h-11 items-center gap-3 py-2.5">
      <span className="relative flex-1 text-item">
        <span
          className={
            watched && phase === "settled" ? "text-stock-dim line-through decoration-2 decoration-signal" : ""
          }
        >
          {titleName}
        </span>

        {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
      </span>

      {watched ? (
        <span className="code-line text-stock-dim">Watched</span>
      ) : (
        <MarkWatchedButton label={`Mark ${titleName} watched`} onClick={attempt} />
      )}

      {phase === "marking" ? <WatchStamp /> : null}
    </li>
  );
}

/** `EpisodeLine` and `FilmRow`'s one interactive element, identical either way — the same
 *  border/press treatment `DESIGN.md`'s Material Event Rule reserves for a recording
 *  control: it never turns blue, slides, or removes the row. */
function MarkWatchedButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="code-line shrink-0 border border-signal px-2.5 py-1 text-signal transition-colors duration-150 hover:bg-signal hover:text-ink"
    >
      Strike it
    </button>
  );
}
