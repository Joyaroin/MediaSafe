"use client";

import type { EpisodeDetail, LibraryState } from "@/db/access";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { useWatchMark } from "./use-watch-mark";
import { RECORDING_CONTROL, STRUCK_NAME, WatchStamp, WatchStrike } from "./watch-mark-motion";

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
        <p className="text-item text-dim">
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
          <p className="code-line text-dim">
            {seasonNo === 0 ? "Specials" : `Season ${seasonNo}`}
          </p>
          <ol className="mt-3 divide-y divide-hair">
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
 * The trailing slot, at one fixed measure in every state.
 *
 * Issue #88 pinned the row's *height* so a mark could not move a row under a thumb. This
 * is the same rule applied along the other axis, and issue #89 is what makes it
 * necessary: the slot now holds four different sets of things — *Up next* beside *Strike
 * it*; *Watched* alone while the strike plays; *Rewatch* beside *Unwatch*; *Rewatch* beside
 * *Watched* where the only other watch was imported — and they are not the same width.
 * Left to size themselves, the episode name beside them would jump every time one gave
 * way to another, which is `DESIGN.md`'s *nothing reflows* broken sideways instead of
 * vertically.
 *
 * So the slot is fixed and its contents are right-aligned inside it, the name takes the
 * rest with `min-w-0`, and the name truncates rather than wrapping. Truncation is the
 * cost, and it is the right one: a name that wraps takes the row's height with it, which
 * is the property #88 measured twice to get.
 *
 * **`10rem` is what the row already needed, not new width.** Measured against the
 * compiled CSS in a real browser, the widest of the four states is the one that was there
 * before issue #89 — *Up next* beside *Strike it*, at `153.6px`. The two #89 adds come in
 * under it: *Rewatch* beside *Unwatch* at `138.1px` (re-measured for #140, which renamed
 * the label from *Undo*), and *Rewatch* beside *Watched* at `136.5px`. So nothing had to
 * give way to make room, and the episode name is exactly as wide as it was.
 *
 * That is also what settled the rewatch control's label. *Watch it again* measures
 * `107.8px` and puts the imported-watch state at `182px` — over the slot, and only
 * payable by taking `22px` off every episode name on the phone. *Rewatch* is
 * `CONTEXT.md`'s own word for the thing, and it fits.
 */
const TRAILING = "flex w-40 shrink-0 items-center justify-end gap-3";

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
 * **Re-measured again for issue #89**, which puts two more controls on the row and so
 * could have broken it: same method, against the compiled CSS in a real browser, over
 * every state the row now has — unwatched, unwatched-and-up-next, watched-with-unwatch,
 * watched-from-an-import, and a name long enough to wrap. The `li` came back
 * `371 × 44px` at a `420px` pane, `326 × 44px` at `375px` and `291 × 44px` at `340px`,
 * **identical in every state at each width**, and the episode name beside it came back
 * identical too (`151px`, `106px`, `71px`) rather than moving as the controls changed.
 * Nothing was clipped at any width. The two things that buy that are the fixed trailing
 * measure (`TRAILING`) and the name's `truncate`; without the second, a long name wraps
 * and takes the row's height with it.
 *
 * ── Idempotency, one key per outstanding write ───────────────────────────────────────
 *
 * The key names the write, not the press: minted when none is outstanding, reused by every
 * route back to that same write, and cleared only when one of them lands. #88 held one for
 * the life of the row, which was correct while a row could only be marked once. See
 * `watch-marks.ts`'s `mark` for why neither that nor one-per-press is correct once a watch
 * can be taken back.
 *
 * **The key is no longer this row's, and neither is the rest of the state** — issue #103,
 * fixing the desktop TONIGHT row (`up-next-grid.tsx`, deleted by issue #136) once sitting
 * on screen at the same time as this pane and able to show the same episode: two rows
 * holding two optimistic states minted two keys against one episode, which is two rows in
 * the table. It is held per *episode*, in `watch-marks.ts`, so that whichever surfaces
 * happen to share one — not only the pair that motivated the fix — agree by construction.
 * Nothing about this file's markup changed — `useWatchMark` is still the one hook and
 * still returns what it did.
 *
 * ── The two controls a struck row offers, and the one it does not ────────────────────
 *
 * Issue #89. A watched episode offers *Rewatch* and *Unwatch*, and **neither is the control
 * that struck it** — the ghost *Strike it* button is gone the moment the row is watched,
 * so the daily gesture cannot be repeated into a rewatch. `ADR-0001`'s per-click key
 * protects one click across its retries and can do nothing about two clicks, and a
 * phantom rewatch is invisible by inspection next to the 1,156 real ones already in the
 * database.
 *
 * The distinction is carried in the chrome as well as the words. *Strike it* is the
 * bordered ghost button `DESIGN.md`'s Buttons section specifies; both of these are
 * underlined text controls with no border and no fill, which is that section's treatment
 * for a control that must not compete with the daily gesture. *Rewatch* stays
 * **vermilion**, because it records a watch and vermilion is what recording a watch looks
 * like; *Unwatch* is dim and never vermilion, exactly as the abandon control is and for the
 * same stated reason.
 *
 * **Neither appears while the mark is still playing.** The trailing slot reads *Watched*
 * for the length of the strike, and the controls arrive with `settled`. A control that
 * materialises under a thumb still resting on the row it just touched is the same mistake
 * as a row that resizes under it.
 *
 * *Unwatch* takes the trailing state line's place rather than sitting beside it, so where
 * there is an unwatch to offer the row reads *Rewatch · Unwatch*, and where there is not —
 * the watch was imported — it reads *Rewatch · Watched*. The struck name is what says
 * *watched* in both (`DESIGN.md`, Episode Line); the code line beside it gives way to the
 * control that acts on it, the way the abandon control's own reassurance gives way when
 * it stops being the true statement.
 *
 * ── Unwatch is offered from `unwatchable`, never guessed ─────────────────────────────
 *
 * `episode.unwatchable` is *this account has a watch of this episode that the application
 * recorded*. An episode whose only watch was imported reads as watched and offers no
 * unwatch at all — `db/access.ts`'s `unwatch` refuses that delete regardless, but a
 * control that is never drawn is the honest half of the pair, not a duplicate of the
 * check.
 *
 * Nothing here counts anything. `watched`, `unwatchable` and `phase` are the whole state,
 * and there is no number of watches on this row to display — `CONTEXT.md`: a rewatch is
 * *never a number kept on a title*.
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
  const fullName = episodeFullName(episode);
  const { watched, unwatchable, phase, pending, attempt, unwatch, settle } = useWatchMark({
    initialWatched: episode.watched,
    initialUnwatchable: episode.unwatchable,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
  });

  return (
    <li className="relative flex min-h-11 items-center gap-3 py-2.5">
      <span
        className={
          episode.upNext && !watched
            ? "code-line w-9 shrink-0 bg-accent px-1 py-0.5 text-center text-accent-ink"
            : "code-line w-9 shrink-0 text-dim"
        }
        data-numeric
      >
        E{episode.episodeNo}
      </span>

      {/* The Named Episode Rule (`DESIGN.md`): an episode is always its name. `null` is
          TMDB not having named it yet — not a licence to print the number a second time
          in its place. */}
      <span className="relative min-w-0 flex-1 text-item">
        <span
          className={`block truncate ${
            watched && phase === "settled"
              ? STRUCK_NAME
              : episode.upNext && !watched
                ? "font-medium"
                : ""
          }`}
        >
          {episode.name === null ? "Not yet named" : episode.name}
        </span>

        {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
      </span>

      <span className={TRAILING}>
        {!watched ? (
          <>
            {episode.upNext ? <span className="code-line text-accent">Up next</span> : null}
            <MarkWatchedButton
              label={`Mark ${fullName} watched`}
              onClick={attempt}
              disabled={pending}
            />
          </>
        ) : phase === "marking" ? (
          <span className="code-line text-dim">Watched</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void attempt()}
              disabled={pending}
              aria-label={`Watch ${fullName} again`}
              className={`code-line text-accent underline decoration-accent underline-offset-4 transition-colors duration-150 hover:text-text ${IN_FLIGHT}`}
            >
              Rewatch
            </button>

            {unwatchable ? (
              <button
                type="button"
                onClick={() => void unwatch()}
                disabled={pending}
                aria-label={`Unwatch ${fullName}`}
                className={`code-line text-dim underline decoration-hair underline-offset-4 transition-colors duration-150 hover:text-text ${IN_FLIGHT}`}
              >
                Unwatch
              </button>
            ) : (
              <span className="code-line text-dim">Watched</span>
            )}
          </>
        )}
      </span>

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
 * **No unwatch, and the reason has changed.** #90 gave one: an episode had none either, so
 * a film offering one would have invented a second rule. Issue #89 has since given the
 * episode row *Rewatch* and *Unwatch*, so that reason is gone and this is now a scope
 * statement instead — #89 is the watched **episode**, and a film's unwatch is nobody's
 * ticket yet. Nothing below is in the way of it: `unwatch` already takes a null
 * `episodeId` and is tested for a film, and `useWatchMark` already offers `unwatch` to any
 * row that wants to draw a control for it. What is missing is the decision and the
 * design, not the write.
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
            watched && phase === "settled" ? STRUCK_NAME : ""
          }
        >
          {titleName}
        </span>

        {phase === "marking" ? <WatchStrike onSettled={settle} /> : null}
      </span>

      {watched ? (
        <span className="code-line text-dim">Watched</span>
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
function MarkWatchedButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  /** Absent on the film row, which has no second control a stray press could reach while
   *  this one is in flight. `EpisodeLine` passes the hook's `pending` (issue #89). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${RECORDING_CONTROL} ${IN_FLIGHT}`}
    >
      Strike it
    </button>
  );
}
