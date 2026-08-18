"use client";

import { useRef, useState } from "react";

import type { EpisodeDetail } from "@/db/access";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { recordWatchAction, undoWatchAction } from "./watch-action";

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
 * Everything about one row that a press changes, in one object.
 *
 * They are one piece of state and not three because every write here sets all three at
 * once and a failure puts all three back — and *back* has to mean the appearance the row
 * had at the moment of that press, captured then rather than reconstructed later. Three
 * `useState`s would make the rollback three statements that can drift out of step, and
 * two of the three are only ever wrong in ways nothing on screen would show.
 */
interface Appearance {
  /** Struck, in the reader's eye. Flips before the server has answered. */
  readonly watched: boolean;
  /** Whether there is an app watch to take back — `db/access.ts`'s `EpisodeDetail`. */
  readonly undoable: boolean;
  /**
   * `unwatched` → `marking` → `settled`. An already-watched episode from the server
   * mounts straight into `settled`: no animation plays for a mark that happened before
   * this page loaded, and only a fresh press runs the sequence.
   */
  readonly phase: "unwatched" | "marking" | "settled";
}

function settledFrom(episode: EpisodeDetail): Appearance {
  return {
    watched: episode.watched,
    undoable: episode.undoable,
    phase: episode.watched ? "settled" : "unwatched",
  };
}

/**
 * The trailing slot, at one fixed measure in every state.
 *
 * Issue #88 pinned the row's *height* so a mark could not move a row under a thumb. This
 * is the same rule applied along the other axis, and issue #89 is what makes it
 * necessary: the slot now holds four different sets of things — *Up next* beside *Strike
 * it*; *Watched* alone while the strike plays; *Rewatch* beside *Undo*; *Rewatch* beside
 * *Watched* where the only other watch was imported — and they are not the
 * same width. Left to size themselves, the episode name beside them would jump every time
 * one gave way to another, which is `DESIGN.md`'s *nothing reflows* broken sideways
 * instead of vertically.
 *
 * So the slot is fixed and its contents are right-aligned inside it, the name takes the
 * rest with `min-w-0`, and the name truncates rather than wrapping. Truncation is the
 * cost, and it is the right one: a name that wraps takes the row's height with it, which
 * is the property #88 measured twice to get.
 *
 * **`10rem` is what the row already needed, not new width.** Measured against the
 * compiled CSS in a real browser, the widest of the four states is the one that was
 * there before this ticket — *Up next* beside *Strike it*, at `153.8px`. The two this
 * ticket adds come in under it: *Rewatch* beside *Undo* at `111.2px`, and *Rewatch*
 * beside *Watched* at `136.5px`. So nothing had to give way to make room, and the
 * episode name is exactly as wide as it was.
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
 * **Re-measured again for issue #89**, which puts two more controls on the row and so
 * could have broken it: same method, against the compiled CSS in a real browser, over
 * every state the row now has — unwatched, unwatched-and-up-next, watched-with-undo,
 * watched-from-an-import, and a name long enough to wrap. The `li` came back
 * `371 × 44px` at a `420px` pane, `326 × 44px` at `375px` and `291 × 44px` at `340px`,
 * **identical in every state at each width**, and the episode name beside it came back
 * identical too (`151px`, `106px`, `71px`) rather than moving as the controls changed.
 * Nothing was clipped at any width. The two things that buy that are the fixed trailing
 * measure (`TRAILING`) and the name's `truncate`; without the second, the long name wraps
 * and takes the row's height with it.
 *
 * ── Idempotency, minted once per press ───────────────────────────────────────────────
 *
 * The key is minted in `press()` and passed down, so one press has one key and its
 * retries reuse it — `db/access.ts`'s `recordWatch` is what makes a repeated key a no-op
 * rather than a second watch. Issue #88 held it in a ref for the life of the row, which
 * was correct while a row could only ever be marked once. It is not correct now that a
 * row can be marked, undone and marked again: see `press()`.
 *
 * ── The two controls a struck row offers, and the one it does not ────────────────────
 *
 * Issue #89. A watched episode offers *Rewatch* and *Undo*, and **neither is the control
 * that struck it** — the ghost *Strike it* button is gone the moment the row is watched,
 * so the daily gesture cannot be repeated into a rewatch. That is the whole point:
 * `ADR-0001`'s per-click key protects one click across its retries and can do nothing
 * about two clicks, and a phantom rewatch is invisible by inspection next to the 1,156
 * real ones already in the database.
 *
 * The distinction is carried in the chrome as well as the words. *Strike it* is the
 * bordered ghost button `DESIGN.md`'s Buttons section specifies; both of these are
 * underlined text controls with no border and no fill, which is that section's treatment
 * for a control that must not compete with the daily gesture. *Rewatch* stays
 * **vermilion**, because it records a watch and vermilion is what recording a watch looks
 * like; *Undo* is dim and never vermilion, exactly as the abandon control is and for the
 * same stated reason.
 *
 * *Undo* takes the trailing state line's place rather than sitting beside it, so where
 * there is an undo to offer the row reads *Rewatch · Undo*, and where there is not —
 * the watch was imported — it reads *Rewatch · Watched*. The struck name is what says
 * *watched* in both (`DESIGN.md`, Episode Line); the code line beside it gives way to the
 * control that acts on it, the way the abandon control's own reassurance gives way when
 * it stops being the true statement.
 *
 * **Neither appears while the mark is still playing.** The trailing slot reads *Watched*
 * for the length of the strike, and the controls arrive with `settled`. A control that
 * materialises under a thumb still resting on the row it just touched is the same mistake
 * as a row that resizes under it.
 *
 * ── Undo is offered from `undoable`, never guessed ───────────────────────────────────
 *
 * `episode.undoable` is *this account has a watch of this episode that the application
 * recorded*. An episode whose only watch was imported reads as watched and offers no undo
 * at all — `db/access.ts`'s `undoWatch` refuses that delete regardless, but a control
 * that is never drawn is the honest half of the pair, not a duplicate of the check.
 *
 * Nothing here counts anything. `watched`, `undoable` and `phase` are the whole state,
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
  const [appearance, setAppearance] = useState<Appearance>(() => settledFrom(episode));
  const [pending, setPending] = useState(false);
  /**
   * This row's outstanding lost write, and **which of the two it was**.
   *
   * The kind is not bookkeeping. `resolve()` means *the write landed, or the reader no
   * longer needs to see this*, and a landed write only says that about a lost one of the
   * same kind. A mark that lands after a lost mark genuinely settles it — the episode is
   * watched, which is what the reader was trying to say. A **rewatch that lands after a
   * lost undo settles nothing**: the undo is still lost, and there is now one more watch
   * on the episode than the reader asked for. Resolving there would take the only notice
   * of it off the screen, which is `SPEC.md` §3.3 broken by a write that succeeded.
   */
  const raised = useRef<{ kind: "watch" | "undo"; handle: WriteFailureHandle } | null>(null);
  const { watched, undoable, phase } = appearance;

  const fullName = episodeFullName(episode);

  /**
   * A function declaration, not `useCallback`, for the reason `catalogue-result.tsx`
   * gives its own `attempt`: it hands itself to the toast as `retry`, and everything that
   * varies between one press and the next is a parameter rather than a closed-over piece
   * of state that a retry running minutes later would read stale.
   */
  async function attemptWatch(sourceKey: string, previous: Appearance): Promise<void> {
    setPending(true);
    setAppearance({ watched: true, undoable: true, phase: "marking" });

    const outcome = await record(sourceKey);
    setPending(false);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      settle("watch");
      return;
    }

    setAppearance(previous);

    // One toast per lost write, not one per attempt.
    if (raised.current) return;

    raised.current = {
      kind: "watch",
      handle: writeFailures.raise({
        title: titleName,
        episode: fullName,
        reference: outcome.reference,
        retry: () => void attemptWatch(sourceKey, previous),
      }),
    };
  }

  /**
   * ── Why this one is not offered a retry ───────────────────────────────────────────
   *
   * A lost *insert* is safe to send again: it carries an idempotency key, so the second
   * attempt is either the same row or no row (`db/access.ts`, `recordWatch`). A lost
   * *delete* carries no such thing. "The response never arrived" and "the delete never
   * happened" are the same event from here, and a retry of the first one removes a second
   * watch — the earlier half of a rewatch, gone, with nothing on any screen to say so.
   * That is precisely the silent history edit this ticket exists to prevent, so the toast
   * is raised without a `retry` (`errors/write-failure.ts` allows exactly this: *absent
   * when there is nothing sensible to retry*) and the row goes back to being struck.
   * Pressing undo again is then a deliberate act against a row the reader can see, which
   * is the whole posture of this surface.
   */
  async function attemptUndo(previous: Appearance): Promise<void> {
    setPending(true);
    // The optimistic guess is *unwatched*, because it is right for every episode with one
    // app watch and nothing underneath — which is nearly all of them. Where it is wrong,
    // the outcome below says so and it is corrected rather than left standing.
    setAppearance({ watched: false, undoable: false, phase: "unwatched" });

    const outcome = await undo();
    setPending(false);

    if (outcome.ok) {
      settle("undo");
      // What survived, from the table: an imported watch underneath, or the earlier half
      // of a rewatch, both of which leave this episode watched. `settled`, never
      // `marking` — nothing was recorded here, so nothing is stamped.
      setAppearance({
        watched: outcome.watched,
        undoable: outcome.undoable,
        phase: outcome.watched ? "settled" : "unwatched",
      });
      return;
    }

    setAppearance(previous);

    if (raised.current) return;

    raised.current = {
      kind: "undo",
      handle: writeFailures.raise({
        title: titleName,
        episode: fullName,
        reference: outcome.reference,
      }),
    };
  }

  /** Take the toast down only if it was raised by a lost write of this same kind. */
  function settle(kind: "watch" | "undo"): void {
    if (raised.current?.kind !== kind) return;
    raised.current.handle.resolve();
    raised.current = null;
  }

  /**
   * The key is minted **here, in the browser, once per press** — and handed to the
   * attempt, which hands the same one to its own retry. It is a parameter and not a ref
   * for a reason this ticket is what surfaced: a row can now be marked, undone, and
   * marked again, and a key held for the life of the row would make that third gesture
   * collide with the first. `recordWatch` would treat it as a retry, write nothing, and
   * answer *ok* — a struck row with no watch behind it, and no error anywhere.
   */
  function press(): void {
    void attemptWatch(crypto.randomUUID(), appearance);
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

  /** The same wrapper as `record` above, around the delete. */
  async function undo() {
    try {
      return await undoWatchAction({ libraryEntryId, episodeId: episode.id });
    } catch (error) {
      return {
        ok: false as const,
        reference: referenceFor(error, { surface: "undo-watch" }),
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
      <span className="relative min-w-0 flex-1 text-item">
        <span
          className={`block truncate ${
            watched && phase === "settled"
              ? "text-stock-dim line-through decoration-2 decoration-signal"
              : episode.upNext && !watched
                ? "font-medium"
                : ""
          }`}
        >
          {episode.name === null ? "Not yet named" : episode.name}
        </span>

        {phase === "marking" ? (
          <span
            className="watch-strike"
            aria-hidden
            onAnimationEnd={() =>
              setAppearance((current) =>
                current.phase === "marking" ? { ...current, phase: "settled" } : current,
              )
            }
          />
        ) : null}
      </span>

      <span className={TRAILING}>
        {!watched ? (
          <>
            {episode.upNext ? <span className="code-line text-signal">Up next</span> : null}
            <button
              type="button"
              onClick={press}
              disabled={pending}
              aria-label={`Mark ${fullName} watched`}
              className={`code-line border border-signal px-2.5 py-1 text-signal transition-colors duration-150 hover:bg-signal hover:text-ink ${IN_FLIGHT}`}
            >
              Strike it
            </button>
          </>
        ) : phase === "marking" ? (
          <span className="code-line text-stock-dim">Watched</span>
        ) : (
          <>
            <button
              type="button"
              onClick={press}
              disabled={pending}
              aria-label={`Watch ${fullName} again`}
              className={`code-line text-signal underline decoration-signal underline-offset-4 transition-colors duration-150 hover:text-stock ${IN_FLIGHT}`}
            >
              Rewatch
            </button>

            {undoable ? (
              <button
                type="button"
                onClick={() => void attemptUndo(appearance)}
                disabled={pending}
                aria-label={`Undo watching ${fullName}`}
                className={`code-line text-stock-dim underline decoration-rule-bold underline-offset-4 transition-colors duration-150 hover:text-stock ${IN_FLIGHT}`}
              >
                Undo
              </button>
            ) : (
              <span className="code-line text-stock-dim">Watched</span>
            )}
          </>
        )}
      </span>

      {phase === "marking" ? (
        <span className="watch-stamp code-line" aria-hidden>
          Watched
        </span>
      ) : null}
    </li>
  );
}
