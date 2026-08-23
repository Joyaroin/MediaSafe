"use client";

import { useState } from "react";

import type { EpisodeDetail, LibraryState } from "@/db/access";
import { GHOST_RECOVERY_COMPACT, IN_FLIGHT } from "@/errors/recovery-buttons";
import type { TitleKind } from "@/tmdb/mirror";
import { CheckmarkIcon } from "./checkmark-icon";
import {
  EPISODE_NAME_CELL,
  EPISODE_NUMBER,
  EPISODE_ROW,
  SEASON_LIST,
} from "./episode-line";
import { coveredUpTo, markUpToLabel } from "./mark-up-to";
import { MarkUpToDialog } from "./mark-up-to-dialog";
import { MarkUpToIcon } from "./mark-up-to-icon";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";
import { episodeFullName, groupBySeason, seasonHeading } from "./season-grouping";
import { useLiveEpisodes } from "./use-live-episodes";
import { useWatchMark } from "./use-watch-mark";
import {
  QUIET_RECORDING_CONTROL,
  RECORDING_GLYPH,
  RECORDING_HIT_BOX,
  WATCHED_NAME,
  WatchSweep,
} from "./watch-mark-motion";

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

  return <SeasonList episodes={episodes} libraryEntryId={libraryEntryId} titleName={titleName} />;
}

/**
 * The seasons, and the one piece of state that belongs to the list rather than to a row —
 * issue #196's confirmation.
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
}: {
  episodes: readonly EpisodeDetail[];
  libraryEntryId: string;
  titleName: string;
}) {
  const [confirming, setConfirming] = useState<{
    readonly through: EpisodeDetail;
    readonly covered: readonly EpisodeDetail[];
  } | null>(null);

  const live = useLiveEpisodes(libraryEntryId, episodes);

  return (
    <>
      {groupBySeason(live).map(([seasonNo, inSeason]) => (
        <div key={seasonNo} className={PROGRAMME_NOTE_SECTION}>
          <p className="code-line text-dim">{seasonHeading(seasonNo)}</p>
          <ol className={SEASON_LIST}>
            {inSeason.map((one) => (
              <EpisodeLine
                key={one.id}
                episode={one}
                covered={coveredUpTo(live, one)}
                libraryEntryId={libraryEntryId}
                titleName={titleName}
                onMarkUpTo={setConfirming}
              />
            ))}
          </ol>
        </div>
      ))}

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
 * The trailing slot, at one fixed measure in every state.
 *
 * Issue #88 pinned the row's *height* so a mark could not move a row under a thumb. This
 * is the same rule applied along the other axis, and issue #89 is what makes it
 * necessary: the slot holds several different sets of things — *Up next* beside *Strike
 * it*; *Watched* alone while the strike plays; *Rewatch* beside *Unwatch*; and, since
 * #196, *watched up to here* on either side of that split — and they are not the same
 * width. Left to size themselves, the episode name beside them would jump every time one
 * gave way to another, which is `DESIGN.md`'s *nothing reflows* broken sideways instead
 * of vertically. (#89 wrote *three* here and enumerated three; the count is deliberately
 * not restated now that the table below is the thing that enumerates them.)
 *
 * So the slot is fixed and its contents are right-aligned inside it, the name takes the
 * rest with `min-w-0`, and the name truncates rather than wrapping. Truncation is the
 * cost, and it is the right one: a name that wraps takes the row's height with it, which
 * is the property #88 measured twice to get.
 *
 * ── `12rem`, and what issue #203 found when it re-measured ──────────────────────────
 *
 * The slot was `10rem` from #89 until #203, on the strength of a measurement that was
 * true when it was taken: the widest state was *Up next* beside *Strike it*, and #89's
 * own addition — *Rewatch* beside *Unwatch* — came in under it, so nothing had to give
 * way and the episode name stayed exactly as wide as it was.
 *
 * **Issue #195 ended that and nothing re-measured.** It took the two watched controls
 * from underlined text to `GHOST_RECOVERY`, whose `px-4 py-2` and border are far wider
 * and taller than the prose they replaced. The result was on `main` for two tickets: a
 * settled watched row at `50.2px` against every other state's `44px`, and `215.9px` of
 * controls in a `160px` slot, spilling leftward over the episode name because they are
 * `justify-end` inside a `shrink-0` box. **The row grew the moment a mark settled** —
 * `DESIGN.md` §6's *re-measure if you touch the row*, and the exact property
 * `episode-line.ts` was measured into existence twice to hold.
 *
 * Re-measured for #203 in a real Chromium tab against the compiled CSS with Archivo
 * loaded (`getBoundingClientRect`), over every state the row has, at a `420px` pane and
 * again at `375px` and `340px` — the contents figures are identical at all three, because
 * the slot is fixed and the name takes the rest:
 *
 * | Trailing slot state | Before (of `160px`) | Row | After (of `192px`) | Row |
 * |---|---|---|---|---|
 * | *Strike it* | `63.7px` | `44px` | `63.7px` | `44px` |
 * | *Up next* · *Strike it* | `118.3px` | `44px` | `114.3px` | `44px` |
 * | *Watched* (mid-sweep) | `49.1px` | `44px` | `49.1px` | `44px` |
 * | up-to · *Strike it* | `101.7px` | `44px` | `97.7px` | `44px` |
 * | *Up next* · up-to · *Strike it* | `156.3px` | `44px` | `148.3px` | `44px` |
 * | *Rewatch* · *Unwatch* | `177.9px` — **over** | `50.2px` | `149.9px` | `44px` |
 * | up-to · *Rewatch* · *Unwatch* | `215.9px` — **over** | `50.2px` | **`183.9px`** | `44px` |
 *
 * Every state is back on `44px`, and the widest lands `8.1px` inside the slot — more
 * headroom than the row already lived with, since #196's widest unwatched state sat
 * `3.7px` inside the old one.
 *
 * ── Three things gave way, and the third is the one that cost something ─────────────
 *
 * 1. **The controls take `GHOST_RECOVERY_COMPACT`** — the same register at
 *    `RECORDING_CONTROL`'s measure, so *Rewatch* and *Unwatch* are the size of the
 *    *Strike it* they replace. That alone fixes the **height** outright, and is the whole
 *    of what #203 called "a more compact ghost variant".
 * 2. **The slot's own gap is `gap-2`, not `gap-3`.** The row's `gap-3` separates its three
 *    major cells — number, name, slot. These are sibling controls inside one of those
 *    cells, and a group should sit tighter than the cells it sits in. It is also `8px`
 *    that does not come out of the name.
 * 3. **The slot is `12rem`.** This is the part that is a decision rather than a
 *    correction, and #203 said so: no padding value fixes the widest state. Its two
 *    labels are `48.7px` and `49.2px` of text and the up-to glyph is a `26px` box —
 *    `123.9px` before a single pixel of border, padding or gap — so `160px` cannot hold
 *    them and be a button. The slot had to widen or a control had to go, and removing one
 *    is #196's and #145's call, not this ticket's.
 *
 * **What that costs is name width, stated plainly**: `152px` → `120px` at a `420px` pane,
 * `107px` → `75px` at `375px`, `71px` → `40px` at `340px`. The name still measures the
 * same in every one of the seven states at a given width — which is the property this
 * whole constant exists for, and the one thing that was never allowed to be traded.
 *
 * ── What issue #217 found when it re-measured ────────────────────────────────────────
 *
 * *Strike it* became a checkmark (`MarkWatchedButton`), which retires the row's widest
 * unwatched states rather than growing them: `RECORDING_HIT_BOX` is a fixed `44px` square
 * with no text to widen, so the bullet above that reads *"Rewatch and Unwatch are the size
 * of the Strike it they replace"* is now a fact about #203's history rather than about a
 * control still in the row — Rewatch and Unwatch did not change, and `GHOST_RECOVERY_COMPACT`
 * still carries its own `px-2.5 py-1` regardless of what the unwatched control now looks
 * like.
 *
 * Re-measured against a real Chromium tab (`getBoundingClientRect`, via a Playwright
 * instance rather than `npm run dev` — this ticket's session had no database or auth
 * available to render the live page, so a standalone document was built from this file's
 * own class strings instead of the compiled stylesheet directly; worth a second pass
 * against the running app). The row-height figures below are that harness's own, exact:
 * nothing in `RECORDING_HIT_BOX`'s box model depends on a typeface. The two combined-width
 * figures that include a text label carry Archivo's own already-measured glyph widths
 * (`tests/episode-row-trailing-slot.test.ts`'s `GLYPH` table) rather than the harness's
 * substitute system font, for the reason that table gives for itself — recomputing text
 * metrics a second, worse way. Over the four states the checkmark changed, at `420px`,
 * `375px` and `340px` panes — every figure identical across all three widths, the same
 * property `TRAILING` has held since #89:
 *
 * | Trailing slot state | Contents, of `192px` | Row |
 * |---|---|---|
 * | checkmark alone | `44px` | `44px` |
 * | *Up next* · checkmark | `94.6px` | `44px` |
 * | up-to · checkmark | `78px` | `44px` |
 * | *Up next* · up-to · checkmark | `128.6px` | `44px` |
 *
 * Every checkmark state lands **under** its old *Strike it* figure (`63.7` / `114.3` /
 * `97.7` / `148.3px`) rather than over it — `RECORDING_HIT_BOX`'s `44px` fixed square is
 * narrower than a text pill wide enough to hold *Strike it*, so this ticket only ever
 * gives the slot more room back, never less. The row height holds at `44px` in all four
 * states, unchanged from #203's own table above — confirmed directly (not just inferred
 * from the class strings) by the `btnTop === liTop` / `btnBottom === liBottom` readings
 * the harness took alongside the width figures: `RECORDING_HIT_BOX`'s margin-corrected
 * `44px` box paints exactly flush with the row's own top and bottom edge, at every one of
 * the three pane widths.
 */
const TRAILING = "flex w-48 shrink-0 items-center justify-end gap-2";

/**
 * `DESIGN.md`, Episode Line: `E1` as a dim, fixed-width, tabular code line; the episode
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
 * `327 × 44px` before the press and after the mark settled, identical again. `FilmRow`
 * below reuses this exact `li` shape for the same reason — a row that resizes when it
 * succeeds is still a row that moves under a thumb still resting on it, whether the row is
 * an episode's or a film's.
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
 * daily gesture cannot be repeated into a rewatch. `ADR-0001`'s per-click key
 * protects one click across its retries and can do nothing about two clicks, and a
 * phantom rewatch is invisible by inspection next to the 1,156 real ones already in the
 * database.
 *
 * The distinction used to be carried in the chrome as well as the words — *Strike it* was
 * the bordered ghost button, and both of these were underlined text with no border and no
 * fill, a control that must not compete with the daily gesture. Issue #195 removed that
 * distinction: every one of the fourteen underlined controls in the app, this pair
 * included, now takes `GHOST_RECOVERY` — the same bordered outline `DESIGN.md` §10's
 * Buttons subsection specifies, spent knowingly rather than by accident (§10 and §12 both
 * record it). What still separates the two is only the words. *Rewatch* stays **accent**
 * for the reason it always did — it records a watch, and the accent is what recording a
 * watch looks like — and it needed no override to keep it, since it already painted accent
 * before this ticket touched it. *Unwatch* is the one that changed: it used to be dim and
 * never accent, exactly as the abandon control was, and now takes the same `GHOST_RECOVERY`
 * as everything else in the batch — a knowing accent spend `remove-control.tsx` and
 * `abandon-control.tsx`'s own docblocks name too.
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
 * now (`DESIGN.md`, Episode Line, as issue #139 redraws it); the code line beside it gives
 * way to the control that acts on it, the way the abandon control's own reassurance gives
 * way when it stops being the true statement. The *Watched* code line survives in one
 * place only — the length of the sweep, before either control arrives.
 *
 * ── Unwatch is offered on every watched row — issue #145 ─────────────────────────────
 *
 * It used to be conditional. `episode.unwatchable` said *this account has a watch of this
 * episode that the application recorded*, and an episode whose only watch was imported
 * read as watched and offered no unwatch at all. The library is 19,558 imported watches
 * (`SPEC.md` §7), so that control did not render on essentially anything its only reader
 * owns: the feature existed and was structurally invisible to him.
 *
 * `db/access.ts`'s `unwatch` now removes every watch of an episode whatever recorded it,
 * so the condition has nothing left to say and the field behind it is gone rather than
 * pinned to `watched`. **A watched row offers an unwatch. That is the whole rule**, and
 * `watched` is what states it — there is no second flag here that could disagree with the
 * dimmed name beside it.
 *
 * Nothing here counts anything. `watched` and `phase` are the whole state, and there is no
 * number of watches on this row to display — `CONTEXT.md`: a rewatch is *never a number
 * kept on a title*.
 */
function EpisodeLine({
  episode,
  covered,
  libraryEntryId,
  titleName,
  onMarkUpTo,
}: {
  episode: EpisodeDetail;
  /** What a press of *watched up to here* would record, or `null` where the control must
   *  not be drawn on this row at all — `mark-up-to.ts` owns that rule (issue #196). */
  covered: readonly EpisodeDetail[] | null;
  libraryEntryId: string;
  titleName: string;
  onMarkUpTo: (confirming: {
    readonly through: EpisodeDetail;
    readonly covered: readonly EpisodeDetail[];
  }) => void;
}) {
  const fullName = episodeFullName(episode);
  const { watched, phase, pending, attempt, unwatch, settle } = useWatchMark({
    initialWatched: episode.watched,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
  });

  return (
    <li className={`relative ${EPISODE_ROW}`}>
      <span
        className={
          episode.upNext && !watched
            ? "code-line w-9 shrink-0 bg-accent px-1 py-0.5 text-center text-accent-ink"
            : EPISODE_NUMBER
        }
        data-numeric
      >
        E{episode.episodeNo}
      </span>

      {/* The Named Episode Rule (`DESIGN.md`): an episode is always its name. `null` is
          TMDB not having named it yet — not a licence to print the number a second time
          in its place. */}
      <span className={EPISODE_NAME_CELL}>
        <span
          className={`block truncate ${
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

      <span className={TRAILING}>
        {/* The label first, then the controls — it is a fact about the row rather than
            something to press, and issue #196's control arriving between the two would
            put a button between a label and the state it labels. Lifted out of the
            unwatched branch it used to sit inside, which changes nothing about when it
            renders: an up-next episode is by definition unwatched, and `!watched` is
            restated here so a still-optimistic mark takes it off the row at once. */}
        {episode.upNext && !watched ? (
          <span className="code-line text-accent">Up next</span>
        ) : null}

        {/* Left of whatever the row's own state offers, so the daily gesture keeps the
            outside edge under the thumb. It sits outside the branch below because it is
            offered on **both** sides of it: a watched row with a gap behind it is exactly
            the row this control is for. */}
        {covered === null ? null : (
          <MarkUpToButton
            label={markUpToLabel(episode)}
            onClick={() => onMarkUpTo({ through: episode, covered })}
            disabled={pending}
          />
        )}

        {!watched ? (
          <MarkWatchedButton
            label={`Mark ${fullName} watched`}
            onClick={attempt}
            disabled={pending}
          />
        ) : phase === "marking" ? (
          <span className="code-line text-dim">Watched</span>
        ) : (
          <>
            {/* Issue #195: both rows lose their underline for the same ghost treatment
                the rest of this batch takes. Rewatch already painted accent — it
                re-records a watch, which is what the accent is for — so this is no
                widening for that one; Unwatch was dim and moves onto the accent register
                knowingly, the same call the abandon and remove controls make below.

                Issue #203: at `GHOST_RECOVERY_COMPACT` rather than `GHOST_RECOVERY` —
                the same register at the row's own compact measure, so the row does not
                grow when a mark settles. `TRAILING` above holds the re-measurement, #217's
                own entry included. */}
            <button
              type="button"
              onClick={() => void attempt()}
              disabled={pending}
              aria-label={`Watch ${fullName} again`}
              className={`${GHOST_RECOVERY_COMPACT} ${IN_FLIGHT}`}
            >
              Rewatch
            </button>

            <button
              type="button"
              onClick={() => void unwatch()}
              disabled={pending}
              aria-label={`Unwatch ${fullName}`}
              className={`${GHOST_RECOVERY_COMPACT} ${IN_FLIGHT}`}
            >
              Unwatch
            </button>
          </>
        )}
      </span>

      {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
    </li>
  );
}

/**
 * The film recording control — issue #90. A film has no episode list, so this is the row
 * that occupies its slot instead: the same `li` shape `EpisodeLine` measured, the same
 * sweep (issue #139), the same `use-watch-mark.ts` hook, driving `recordWatch` with a null
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
    <li className={`relative ${EPISODE_ROW}`}>
      <span className="flex-1 text-item">
        <span className={watched && phase === "settled" ? WATCHED_NAME : ""}>
          {titleName}
        </span>
      </span>

      {watched ? (
        <span className="code-line text-dim">Watched</span>
      ) : (
        <MarkWatchedButton label={`Mark ${titleName} watched`} onClick={attempt} />
      )}

      {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
    </li>
  );
}

/**
 * `EpisodeLine` and `FilmRow`'s one interactive element, identical either way — the same
 * border/press treatment `DESIGN.md`'s Material Event Rule reserves for a recording
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
 */
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
      className={`${RECORDING_HIT_BOX} ${IN_FLIGHT}`}
    >
      <span className={RECORDING_GLYPH}>
        <CheckmarkIcon className="block h-4 w-4" />
      </span>
    </button>
  );
}

/**
 * *Watched up to here* — issue #196, and the only control in the application whose whole
 * text is its accessible label.
 *
 * ── Why a glyph, and what the row bought with it ─────────────────────────────────────
 *
 * The row is a fixed measure (`TRAILING` above), and its widest *unwatched* state was
 * already *Up next* beside *Strike it*. Re-measured in a real Chromium tab against the
 * compiled CSS (`getBoundingClientRect`, with Archivo loaded), the way `TRAILING` and
 * `episode-line.ts` both record their own numbers — the slot's contents, at a `420px`
 * pane and again at `375px`, both figures identical because the slot is fixed and the
 * name takes the rest:
 *
 * | Trailing slot state | Width, of `192px` | Row height |
 * |---|---|---|
 * | *Strike it* | `63.7px` | `44px` |
 * | *Up next* · *Strike it* | `114.3px` | `44px` |
 * | *Watched* (mid-sweep) | `49.1px` | `44px` |
 * | this · *Strike it* | `97.7px` | `44px` |
 * | ***Up next* · this · *Strike it*** | **`148.3px`** | `44px` |
 * | *Rewatch* · *Unwatch* | `149.9px` | `44px` |
 * | this · *Rewatch* · *Unwatch* | `183.9px` | `44px` |
 *
 * The fifth row is the widest state this control can put a row into on its own: an
 * up-next episode with a gap behind it. Across every state the episode name is **exactly
 * as wide as it was** — `120px` at a `420px` pane, `75px` at `375px` — which is the whole
 * reason this is an icon: *Watched up to here* as words is far past the slot, and the only
 * thing left to pay for them with is the name.
 *
 * ── The last two rows were a live bug when #196 shipped, and #203 closed it ──────────
 *
 * They are measured here because this file is where the row's numbers live, and #196 left
 * them in rather than out so the table could not read as though the row still fitted. It
 * did not. Issue #195 had taken *Rewatch* and *Unwatch* from underlined text to
 * `GHOST_RECOVERY`, whose `px-4 py-2` and border are far wider and taller than the text
 * they replaced, without re-measuring the slot they sit in — `DESIGN.md` §6's *re-measure
 * if you touch the row*. Against the old `160px` slot they came back `177.9px` and
 * `215.9px`, both at `50.2px` tall against every other state's `44px`.
 *
 * Issue #203 re-cut the slot to `192px`, moved that pair onto `GHOST_RECOVERY_COMPACT` and
 * tightened the slot's own gap to `gap-2`; `TRAILING` carries the before-and-after in full.
 * **This control was never the cause and is not the fix** — its own widest state was
 * `3.7px` inside the old slot — but it did add `38px` to the worst of the two, which is
 * why the state is still tabulated here.
 *
 * A stated cost: the control's own box is `26px` square, not the `44px` a thumb wants.
 * That was the register the row already used when this was written — *Strike it*'s box was
 * `26.2px` — so the two sat as a pair. Issue #217 gave the checkmark that replaced *Strike
 * it* a real `44px` hit box, but its **visible** glyph, `RECORDING_GLYPH`, is drawn at this
 * same `26px` measure, so the pair this paragraph describes still holds: what changed is
 * only how much of the checkmark's `44px` is paint versus target, not the size the two
 * glyphs read at. A bigger glyph here would still be a control that shouts over the daily
 * gesture in a slot that has no room for it either.
 *
 * ── Why it is dim and not accent ─────────────────────────────────────────────────────
 *
 * `QUIET_RECORDING_CONTROL` (`watch-mark-motion.tsx`) carries that argument, beside the
 * accent `RECORDING_GLYPH`/`RECORDING_HIT_BOX` it must not compete with — one module
 * owning all three is what stops the pair drifting, and `DESIGN.md` §10 is the rule that
 * says so. It was written inline here until the two-axis review of #196 pointed out that
 * it had become the second unnamed copy of a hairline register the build already had.
 */
function MarkUpToButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  /** The row's own write being on the wire disables this too — they touch the same
   *  episode, and `watch-marks.ts` is where that overlap is reasoned about. */
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${QUIET_RECORDING_CONTROL} ${IN_FLIGHT}`}
    >
      {/* `block`, so the svg does not sit on a text baseline and add descender space to a
          row whose height is measured. */}
      <MarkUpToIcon className="block h-4 w-4" />
    </button>
  );
}
