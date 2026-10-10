"use client";

import { useState } from "react";

import { SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { PendingLine } from "@/app/pending-line";
import type { EpisodeDetail } from "@/db/access";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import type { TitleKind } from "@/tmdb/mirror";
import { CheckmarkIcon } from "./checkmark-icon";
import {
  EPISODE_NAME_CELL,
  EPISODE_NUMBER,
  EPISODE_NUMBER_UP_NEXT,
  EPISODE_ROW,
  SEASON_LIST,
} from "./episode-line";
import { coveredUpTo, markUpToCount } from "./mark-up-to";
import { MarkUpToDialog } from "./mark-up-to-dialog";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { HOLDABLE, useHoldGesture } from "./use-hold-to-select";
import { WatchMenu } from "./watch-menu";
import { SeasonChips } from "./season-chips";
import { defaultSeason, episodeFullName, groupBySeason } from "./season-grouping";
import { useLiveEpisodes } from "./use-live-episodes";
import { finishedSeasons, seasonMarkTarget } from "./title-page";
import { useWatchMark } from "./use-watch-mark";
import { watchMarks } from "./watch-marks";
import {
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  SETTLED_GLYPH,
  WATCHED_NAME,
  WatchSweep,
} from "./watch-mark-motion";

/**
 * The season/episode list — the row that carries the product's most important rule
 * (the Episode Line). Shared verbatim by the desktop pane and the phone route,
 * because #58's episode list is one design at two densities, not one of the three genuine
 * divergences.
 *
 * The whole file is a client boundary now — issue #88 puts the recording control here,
 * and `ProgrammeNoteContent`, its own server-component caller, stays exactly that: the
 * phone route renders it unguarded, the desktop pane inside its own client shell, and
 * either way this is the one place that needs the browser.
 *
 * ── The film branch ────────────────────────────────────────────────────────────────────
 *
 * A film has no seasons, so this was `kind === "film" ? null : …` in full through #88 —
 * "the correct answer to a question a film was never asked". #90 filled that `null` with
 * the film recording control, on the grounds that a film's page had nothing else in this
 * slot; it has moved on again, to `film-watch-row.tsx` and the hero's card, because *the
 * slot at the foot of the page* turned out to be the wrong argument for a title's only
 * action. So this is back to `null`, and the `kind` prop is what still says so.
 *
 * The `null` is belt to `ProgrammeNoteContent`'s braces: that component does not render
 * this component's **card** for a film either, which is what keeps an empty card off the
 * page. Returning `null` from inside a card would have drawn one.
 *
 * `state` and `onStateChange` went with the film row — they were the film branch's props
 * and nothing else on this component ever read them. An episode's own mark reports through
 * `use-watch-mark.ts` and needs no callback from here.
 */
export function ProgrammeNoteEpisodes({
  kind,
  episodes,
  libraryEntryId,
  titleName,
  episodesPending,
  today,
}: {
  kind: TitleKind;
  episodes: readonly EpisodeDetail[];
  libraryEntryId: string;
  titleName: string;
  /** The reader's calendar day, for what *Mark season watched* can reach. */
  today: string;
  /**
   * This show's episodes have not mirrored — `TitleDetailRow.episodesPending`, and issue
   * #272. It is the row's answer and never this component's: inferring it from
   * `episodes.length === 0` is the exact conflation the column was added to end.
   */
  episodesPending: boolean;
}) {
  if (kind === "film") return null;

  /**
   * **Pending, and it is checked before empty because it outranks it.**
   *
   * The two used to be one sentence — *No episode data yet* answered a show whose mirror
   * was still running and a show TMDB genuinely lists nothing for, and #272 is where they
   * separate. The order matters in one direction only: a pending title has no episode rows
   * yet, so the empty branch below would catch it first and say the wrong thing.
   *
   * Radius 2 — *one region is pending, beside rendered content*. Everything
   * else on this page is at full strength the whole time; this is the one region genuinely
   * unresolved and it says so in the one dim line the rule settles. **No skeleton and no
   * shimmer**, and the region reserves no height for what it does not yet know the size
   * of — §9 argues both at length, and a season list is the exact shape a skeleton would
   * be reached for.
   *
   * The card around this is `programme-note-content.tsx`'s, and it is drawn for a show
   * either way, so a pending region is a card with a line in it rather than a card with
   * nothing in it.
   */
  if (episodesPending) {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <PendingLine />
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className={`arrive ${PROGRAMME_NOTE_SECTION}`}>
        <p className="text-item text-dim">
          {/*
            Missing and empty stay distinct here as everywhere: this is not
            "a season with nothing in it", which would be a `library_entry` bug — and since
            #272 it is not *the mirror has not arrived* either, which `episodesPending`
            answers above. What is left is the honest remainder: TMDB lists no episodes for
            this show, said as a sentence rather than as a season heading over zero rows.
          */}
          No episode data yet.
        </p>
      </div>
    );
  }

  return (
    <SeasonList
      episodes={episodes}
      libraryEntryId={libraryEntryId}
      titleName={titleName}
      today={today}
    />
  );
}

/**
 * The seasons, and the two pieces of state that belong to the list rather than to a row —
 * issue #196's confirmation, and issue #224's chosen season.
 *
 * ── One season mounted, chosen from a chip row ───────────────────────────────────────
 *
 * Reaching Season 4 used to mean scrolling past every episode of Seasons 1 through 3,
 * because every season rendered at once. `SeasonChips` (`season-chips.tsx`) draws every
 * season as a chip in `groupBySeason`'s own specials-last order; only the chip's own
 * season maps to rows below it, which is what turns this from a navigation fix into the
 * render half of the show page's lag as well — a sixty-episode show now mounts the twenty
 * or so rows of one season, not all sixty.
 *
 * `selectedSeason` starts from `defaultSeason` (`season-grouping.ts`) over the
 * server-rendered `episodes` prop, not `live` — a lazy `useState` initializer, run once.
 * Reading `live` instead would recompute the default on every optimistic mark, and
 * marking the selected season's own last episode would silently move the selected chip to
 * the next season out from under whichever reader just pressed it. The chip only moves
 * when a reader presses another one.
 *
 * **The trade, recorded**: browser find-in-page no longer reaches an unselected season.
 * That is the direct cost of only one season's rows existing in the document at a time,
 * and it is the same trade `defaultSeason` is built to make cost nothing in the common
 * case — the season a reader actually wants, the one holding *up next*, is the one
 * already mounted.
 *
 * ── Why the dialog is here and not on the row ────────────────────────────────────────
 *
 * A season of a long-running show is twenty-odd rows and a whole show is sixty-odd. One
 * `<dialog>` per row would put sixty-two of them in the document to have at most one open,
 * and the reader can only be confirming one press at a time — so *which episode is being
 * confirmed* is a fact about the list. `MarkUpToDialog` mounts when there is one and
 * unmounts when there is not, which is also what gives it a stable `aria-labelledby` id
 * without minting one per row.
 *
 * ── Why the set is worked out here too ───────────────────────────────────────────────
 *
 * `coveredUpTo` needs the **whole title's** episodes to answer either question — is
 * there anything unwatched before this row, and what would a press write — and a row has
 * only itself. Passing the answer down keeps `EpisodeLine` a row: it draws a control when
 * it is handed a set and does not when it is handed `null`, and the rule lives in one
 * tested module (`mark-up-to.ts`) rather than in the markup.
 *
 * It is computed over the whole flat, ordered list and not over the season the row is
 * grouped into, because *earlier* crosses a season boundary: pressing the first episode of
 * season two covers the whole of season one.
 *
 * ── Over the live list, not the one the server rendered ─────────────────────────────
 *
 * `useLiveEpisodes` is what makes that list current. Nothing in this application reloads
 * on a landed write, so without it a press left every control standing over episodes that
 * now carried a watch — and the second press offered a count that would have written
 * nothing. `mark-up-to.ts`'s `withLiveWatched` carries the full account; what matters here
 * is that the rows are grouped from the same live list the control's visibility is decided
 * from, so the two can never be answering about different states of the show.
 */
function SeasonList({
  episodes,
  libraryEntryId,
  titleName,
  today,
}: {
  episodes: readonly EpisodeDetail[];
  libraryEntryId: string;
  titleName: string;
  today: string;
}) {
  // The watch menu is hoisted here rather than kept per row: at most one is ever open,
  // and a dialog per row would be a dialog per episode in the DOM.
  const [menuFor, setMenuFor] = useState<EpisodeDetail | null>(null);

  const [confirming, setConfirming] = useState<{
    readonly through: EpisodeDetail;
    readonly covered: readonly EpisodeDetail[];
  } | null>(null);

  const [selectedSeason, setSelectedSeason] = useState(() => defaultSeason(episodes));

  const live = useLiveEpisodes(libraryEntryId, episodes);
  const seasons = groupBySeason(live);

  const [currentSeason, currentEpisodes] =
    seasons.find(([seasonNo]) => seasonNo === selectedSeason) ?? seasons[0];

  const seasonTarget = seasonMarkTarget(live, currentSeason, today);

  return (
    <>
      <SeasonChips
        seasons={seasons.map(([seasonNo]) => seasonNo)}
        finished={finishedSeasons(live)}
        selected={currentSeason}
        onSelect={setSelectedSeason}
        libraryEntryId={libraryEntryId}
      />

      <div className={`arrive ${PROGRAMME_NOTE_SECTION}`}>
        {/* No season label: the selected chip above already names the season, and the
            label under it said the same word twice (the UI overhaul). */}
        {seasonTarget === null ? null : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirming(seasonTarget)}
              className={SECONDARY_BUTTON_COMPACT}
            >
              Mark season watched
            </button>
          </div>
        )}
        <ol className={SEASON_LIST}>
          {currentEpisodes.map((one) => (
            <EpisodeLine
              onOpenMenu={setMenuFor}
              key={one.id}
              episode={one}
              covered={coveredUpTo(live, one)}
              libraryEntryId={libraryEntryId}
              titleName={titleName}
            />
          ))}
        </ol>
      </div>

      {menuFor === null ? null : (
        <WatchMenu
          libraryEntryId={libraryEntryId}
          episodeId={menuFor.id}
          titleName={titleName}
          episodeName={episodeFullName(menuFor)}
          initialWatches={menuFor.watches}
          onClosed={() => setMenuFor(null)}
        />
      )}

      {confirming === null ? null : (
        <MarkUpToDialog
          libraryEntryId={libraryEntryId}
          titleName={titleName}
          through={confirming.through}
          covered={confirming.covered}
          onClosed={() => setConfirming(null)}
        />
      )}
    </>
  );
}

/**
 * ── The slot is `80px` now, and *Rewatch* and *Unwatch* are gone ─────────────────────
 *
 * Everything above is the history of a `192px` slot. It is `w-20` — `80px` — from this
 * ticket,
 * and the two text pills that made `192px` necessary are deleted — `SETTLED_GLYPH`
 * (`watch-mark-motion.tsx`) is what a watched row carries instead, and that constant
 * holds the argument for the deletion, including why the **rewatch concept** in the
 * `watch` table survives it untouched.
 *
 * `80px` and not `44px`, which the first draft of this had: *watched up to here* is
 * offered on **both** sides of the watched branch, so the widest state this slot must
 * hold is that control beside the mark — `26px + 8px gap + 44px = 78px`, which is the
 * `up-to · checkmark` row of the table above, unchanged by any of this. A `44px` slot
 * would have overflowed on exactly the rows a reader is most likely to be looking at.
 *
 * `w-20` and not `w-[78px]`: `78` is not on Tailwind's four-pixel scale, and every fixed
 * measure in this row — `w-48` before it, `w-9`, `w-11` — is. The `2px` of slack is the
 * same shape as the `8.1px` the `192px` slot carried over its own widest state.
 *
 * **The one thing that left the slot besides the pills is the *Up next* label.** It was
 * `42.6px` of text saying what `EPISODE_NUMBER_UP_NEXT` already says two cells to the
 * left, in the accent, on the same row — and it was the only reason this slot ever had to
 * hold prose. The inverted `E5` chip is the whole signal now.
 *
 * That is `112px` back to `EPISODE_NAME_CELL`, which is the point of the ticket: at a
 * `420px` pane the name had about `190px` and the long ones truncated. The names were
 * never too long.
 *
 * | Trailing slot state | Contents, of `80px` |
 * |---|---|
 * | checkmark alone | `44px` |
 * | settled mark alone | `44px` |
 * | undo alone | `44px` |
 * | up-to · checkmark | `78px` |
 * | up-to · settled mark | `78px` |
 * | up-to · undo | `78px` |
 *
 * Every state that carries the mark at all is `RECORDING_HIT_BOX`'s `44px` square, and
 * every glyph inside it is `26px`, so the slot's contents no longer change width when a
 * mark lands, settles, or is taken back. `tests/episode-row-trailing-slot.test.ts` is
 * what holds that.
 */
const TRAILING = "flex w-20 shrink-0 items-center justify-end gap-2";

/**
 * The Episode Line: `E1` as a dim, fixed-width, tabular code line; the episode
 * **name** at `text-item` as the actual content; a trailing state code line. The up-next
 * episode inverts its number into a solid accent chip and carries an accent *Up next*
 * label; a watched episode's name is dimmed, and nothing else marks it — issue #139
 * retired the strike-through this row used to draw over it.
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
 * immediately, before the server has answered" means. `phase` governs only the sweep:
 * while it is `marking`, `WatchSweep` plays over the row; `phase` reaches `settled` on the
 * sweep's own `onAnimationEnd` (`~200ms`), at which point the row falls back to exactly
 * the static, already-watched appearance — the dimmed name, and nothing else.
 *
 * ── The bounding rect ──────────────────────────────────────────────────────────────────
 *
 * The sweep is `position: absolute` (`watch-mark-motion.tsx`'s `WatchSweep`,
 * `app/globals.css`'s `watch-sweep` utility) inside this `<li>`'s own `relative`
 * container, so it never takes up flow space — the same guarantee `watch-strike` /
 * `watch-stamp` held for the strike-and-stamp this replaces, and the one property this
 * ticket exists to keep exactly as it was: **the row's bounding rect, before the sweep and
 * after it, has to be the same rect.** What *is* in flow, and does change between the two
 * states, is the recording control itself: it disappears the instant `watched` flips, and
 * its own box (border, `0.25rem`/`0.625rem` padding) is taller than the plain code-line
 * text either side of it renders on its own. Left alone, that shrinks the row by a
 * fraction of a pixel the moment the button goes — measured, not assumed, and it did not
 * pass the first time: `min-h-[1.375rem]`, sized to the button's padding box alone, still
 * let the row settle about `0.6px` shorter once the button was gone, because Tailwind's
 * preflight box-sizing means `min-height` competes with the *taller* of the row's two
 * states, not the control alone. `min-h-11` (`2.75rem`, Tailwind's own step — not an
 * arbitrary value) is sized to comfortably clear the row's own tallest natural content
 * (name line + `py-2.5`) instead, which is what actually dominates, and pinning to that
 * clamps both states to the same number.
 *
 * **Re-measured for issue #139** against the compiled CSS in a real Chromium tab
 * (`getBoundingClientRect`), not assumed from the class names, over the sweep's own cycle
 * — unwatched-with-button, mid-sweep, `260ms` in (past the sweep's own `200ms`, so the
 * fully-settled paint), and settled-with-rewatch-and-unwatch: the `<li>` came back
 * `372 × 44px`, at `x 24 / y 51.44`, identical across all four, at a `420px` pane width.
 * Re-measured again at a `375px` pane (the phone width, minus the same `1.5rem` gutters):
 * `327 × 44px` before the press and after the mark settled, identical again.
 * `film-watch-row.tsx` reuses this exact `li` shape for the same reason — a row that
 * resizes when it succeeds is still a row that moves under a thumb still resting on it,
 * whether the row is an episode's or a film's.
 *
 * **Re-measured for issue #89** before the sweep existed, which put two more controls on
 * the row and so could have broken it: same method, against the compiled CSS in a real
 * browser, over every state the row had then — unwatched, unwatched-and-up-next,
 * watched-with-unwatch, watched-from-an-import (which #145 has since removed), and a name
 * long enough to wrap. The `li` came back `371 × 44px` at a `420px` pane, `326 × 44px` at
 * `375px` and `291 × 44px` at `340px`, **identical in every state at each width**, and the
 * episode name beside it came back identical too (`151px`, `106px`, `71px`) rather than
 * moving as the controls changed. Nothing was clipped at any width. The two things that
 * buy that are the fixed trailing measure (`TRAILING`) and the name's `truncate`; without
 * the second, a long name wraps and takes the row's height with it. The `1px` gap between
 * that measurement and #139's own (`371` against `372`) is rounding noise between two
 * separately-built harnesses, not a regression — both land on the same `44px` height.
 *
 * **Re-measured for issue #217**, which put a real `44px` hit box into the row for the
 * first time (`RECORDING_HIT_BOX`, `TRAILING`'s own docblock has the full width table).
 * The concern this time was not width but the button's own `-my-2` margin math actually
 * holding in a real browser rather than only on paper — `episode-line.ts`'s own account of
 * `min-h-[1.375rem]` missing by `0.6px` is the standing reason not to trust that kind of
 * arithmetic unverified. `getBoundingClientRect` confirmed it: the checkmark's `44px`
 * border box paints exactly flush with the `<li>`'s own top and bottom edge (`btnTop ===
 * liTop`, `btnBottom === liBottom`, not merely close), and the `<li>` itself holds `44px`
 * at all three pane widths, both alone and beside *Up next* and the up-to control. Taken
 * against a standalone harness built from this file's own class strings rather than
 * `npm run dev` (no database or auth was available in the session that did this), so worth
 * a second pass in the real app before this note is trusted as fully as #89's and #139's.
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
 * that struck it** — the recording control is gone the moment the row is watched, so the
 * daily gesture cannot be repeated into a rewatch. The per-click key
 * protects one click across its retries and can do nothing about two clicks, and a
 * phantom rewatch is invisible by inspection next to the 1,156 real ones already in the
 * database.
 *
 * The distinction used to be carried in the chrome as well as the words — *Strike it* was
 * the bordered ghost button, and both of these were underlined text with no border and no
 * fill, a control that must not compete with the daily gesture. Issue #195 removed that
 * distinction: every one of the fourteen underlined controls in the app, this pair
 * included, now takes `GHOST_RECOVERY` — the same bordered outline the
 * Buttons register specifies, spent knowingly rather than by accident. What still separates the two is only the words. *Rewatch* stays **accent**
 * for the reason it always did — it records a watch, and the accent is what recording a
 * watch looks like — and it needed no override to keep it, since it already painted accent
 * before this ticket touched it. *Unwatch* is the one that changed: it used to be dim and
 * never accent, exactly as the retired abandon control was, and now takes the same
 * `GHOST_RECOVERY` as everything else in the batch — a knowing accent spend
 * `remove-control.tsx`'s own docblock names too.
 *
 * Issue #203 keeps every word of that and changes the measure: the pair wears
 * `GHOST_RECOVERY_COMPACT`, `GHOST_RECOVERY` at `px-2.5 py-1` — the padding the row's own
 * recording control carried at the time, back when it was `RECORDING_CONTROL`'s text pill.
 * #195 chose the register and did not re-measure the fixed slot it had to fit in, and at
 * `px-4 py-2` it did not fit — see `TRAILING`. Issue #217 changed what that control looks
 * like again, to a `44px` hit box around a `26px` glyph (`RECORDING_HIT_BOX`/
 * `RECORDING_GLYPH`), and left `GHOST_RECOVERY_COMPACT`'s own `px-2.5 py-1` untouched:
 * *Rewatch* and *Unwatch* keep the measure #203 gave them on its own terms now, not as a
 * live copy of a control that no longer has that shape. So the chrome that distinguished
 * these two from the row's own recording control is still gone, deliberately; what came
 * back for #203 was only its **size**.
 *
 * **Neither appears while the mark is still playing.** The trailing slot reads *Watched*
 * for the length of the sweep, and the controls arrive with `settled`. A control that
 * materialises under a thumb still resting on the row it just touched is the same mistake
 * as a row that resizes under it.
 *
 * *Unwatch* takes the trailing state line's place rather than sitting beside it, so a
 * settled watched row reads *Rewatch · Unwatch*. The dimmed name is what says *watched*
 * now (the Episode Line, as issue #139 redraws it); the code line beside it gives
 * way to the control that acts on it, the way the abandon control's own reassurance gives
 * way when it stops being the true statement. The *Watched* code line survives in one
 * place only — the length of the sweep, before either control arrives.
 *
 * ── Unwatch is offered on every watched row — issue #145 ─────────────────────────────
 *
 * It used to be conditional. `episode.unwatchable` said *this account has a watch of this
 * episode that the application recorded*, and an episode whose only watch was imported
 * read as watched and offered no unwatch at all. The library is 19,558 imported watches,
 *  so that control did not render on essentially anything its only reader
 * owns: the feature existed and was structurally invisible to him.
 *
 * `db/access.ts`'s `unwatch` now removes every watch of an episode whatever recorded it,
 * so the condition has nothing left to say and the field behind it is gone rather than
 * pinned to `watched`. **A watched row offers an unwatch. That is the whole rule**, and
 * `watched` is what states it — there is no second flag here that could disagree with the
 * dimmed name beside it.
 *
 * Nothing here counts anything. `watched` and `phase` are the whole state, and there is no
 * number of watches on this row to display — a rewatch is *never a number
 * kept on a title*.
 */
function EpisodeLine({
  episode,
  covered,
  libraryEntryId,
  titleName,
  onOpenMenu,
}: {
  episode: EpisodeDetail;
  /** Everything unwatched up to and including this episode when there are earlier gaps,
   *  `null` otherwise — `mark-up-to.ts` owns that rule. Marking this episode then offers
   *  to mark the earlier ones on its toast. */
  covered: readonly EpisodeDetail[] | null;
  libraryEntryId: string;
  titleName: string;
  /** Opens the season's one `WatchMenu` on this episode. */
  onOpenMenu: (episode: EpisodeDetail) => void;
}) {
  const fullName = episodeFullName(episode);
  const earlier = covered?.filter((one) => one.id !== episode.id) ?? [];

  const { watched, watches, phase, pending, attempt, settle } = useWatchMark({
    initialWatched: episode.watched,
    initialWatches: episode.watches,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
    /* Marking an episode with unwatched episodes before it offers to mark those too, on
       the same toast, rather than a separate mark-up-to control drawn on every row. It is
       the same write the confirm dialog makes, through the same store. */
    also:
      earlier.length === 0
        ? undefined
        : () => ({
            label: `Also mark ${earlier.length.toLocaleString("en-GB")} earlier`,
            run: () =>
              void watchMarks.markUpTo(
                { libraryEntryId, episodeId: episode.id },
                earlier.map((one) => ({ libraryEntryId, episodeId: one.id })),
                { title: titleName, episode: `${markUpToCount(earlier)} before ${fullName}` },
              ),
          }),
  });

  /**
   * **Hold the row — or right-click it — for *Rewatch*, *Undo* and *Unwatch*.** Shortcuts
   * only: the watched mark itself is a button that opens the same menu, so none of the
   * three depends on a gesture a keyboard or a screen reader cannot make.
   */
  const hold = useHoldGesture(watched ? () => onOpenMenu(episode) : null);

  function openMenu(event: React.MouseEvent): void {
    event.preventDefault();
    if (watched) onOpenMenu(episode);
  }

  return (
    <li
      className={`relative ${EPISODE_ROW}${watched ? ` ${HOLDABLE}` : ""}`}
      {...hold.handlers}
      onContextMenu={openMenu}
      data-holding={hold.holding ? "true" : undefined}
      data-landed={hold.landed ? "true" : undefined}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={episode.upNext && !watched ? EPISODE_NUMBER_UP_NEXT : EPISODE_NUMBER}
          data-numeric
        >
          E{episode.episodeNo}
        </span>

        {/* The Named Episode Rule: an episode is always its name. `null` is TMDB not having
            named it yet — not a licence to print the number a second time in its place. */}
        <span className={EPISODE_NAME_CELL}>
          <span
            className={`block line-clamp-2 ${
              watched && phase === "settled"
                ? WATCHED_NAME
                : episode.upNext && !watched
                  ? "font-medium"
                  : ""
            }`}
          >
            {episode.name === null ? "Not yet named" : episode.name}
          </span>
        </span>

      </span>

      <span className={TRAILING}>
        {!watched ? (
          <MarkWatchedButton
            label={`Mark ${fullName} watched`}
            onClick={attempt}
            disabled={pending}
          />
        ) : phase === "marking" ? (
          <span className={RECORDING_HIT_BOX}>
            <span className={SETTLED_GLYPH}>
              <CheckmarkIcon className="block h-4 w-4" />
            </span>
          </span>
        ) : (
          <>
            {/* ×2 and up — nothing is stored; it is counted from the watch rows on every
                read. A single watch is what the mark itself says, so `×1` is never drawn. */}
            {watches > 1 ? (
              <span className="code-line text-dim" data-numeric>
                ×{watches}
              </span>
            ) : null}

            {/* A button, so Undo, Unwatch and Rewatch are reachable by keyboard and screen
                reader — not only by holding or right-clicking the row. */}
            <button
              type="button"
              onClick={() => onOpenMenu(episode)}
              disabled={pending}
              aria-label={`${fullName}, watched. Change this watch`}
              aria-haspopup="dialog"
              className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
            >
              <span className={SETTLED_GLYPH}>
                <CheckmarkIcon className="block h-4 w-4" />
              </span>
            </button>
          </>
        )}
      </span>

      {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
    </li>
  );
}


/**
 * `EpisodeLine` and `FilmWatchRow`'s one interactive element, identical either way — the
 * same border/press treatment the Material Event Rule reserves for a recording
 * control: it never turns blue, slides, or removes the row.
 *
 * A checkmark since issue #217, not the word *Strike it* — "a reader looking at an episode
 * row should be able to tell what the control does without learning a verb." The two
 * elements split the job a single `<button>` used to do alone: `RECORDING_HIT_BOX` is the
 * real `44px` target (`watch-mark-motion.tsx` has the measurement in full), and
 * `RECORDING_GLYPH` around `CheckmarkIcon` is what actually paints, at the same `26px` this
 * row has drawn its icon controls at since `MarkUpToIcon`. The label carries exactly what
 * it did before — `Mark ${fullName} watched` / `Mark ${titleName} watched` — so a screen
 * reader loses nothing the eye now gets for free.
 *
 * Exported since issue #228, for `up-next-row.tsx`'s dedicated row — and since the film
 * row moved out of this file, for `film-watch-row.tsx` too. Three callers, one of them in
 * this module and two outside it, and still one control rather than three that resemble
 * each other — the show page is exactly this reuse.
 */
export function MarkWatchedButton({
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
      className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
    >
      {/* `block`, for the same reason `MarkUpToIcon` below takes it: an inline svg sits on
          a text baseline and adds descender space to a row whose height is measured. */}
      <span className={RECORDING_GLYPH}>
        <CheckmarkIcon className="block h-4 w-4" />
      </span>
    </button>
  );
}

