"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { episodeMetaLine } from "@/app/(signed-in)/library/episode-facts";
import { episodePath, type EpisodeInRun } from "@/app/(signed-in)/library/episode-run";
import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import { coveredUpTo, markUpToLabel } from "@/app/(signed-in)/library/mark-up-to";
import { MarkUpToDialog } from "@/app/(signed-in)/library/mark-up-to-dialog";
import { episodeFullName, seasonHeading } from "@/app/(signed-in)/library/season-grouping";
import { useLiveEpisodes } from "@/app/(signed-in)/library/use-live-episodes";
import { useWatchMark } from "@/app/(signed-in)/library/use-watch-mark";
import {
  QUIET_RECORDING_CONTROL_LABELLED,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import type { EpisodeDetail } from "@/db/access";
import {
  GHOST_RECOVERY,
  IN_FLIGHT,
  SOLID_RECOVERY,
} from "@/errors/recovery-buttons";

/**
 * An episode you can read — issue #253's page, everything on it below the back bar.
 *
 * ── Why the whole body is a client component ────────────────────────────────────────
 *
 * The marks. `useWatchMark` and `useLiveEpisodes` are both hooks over `watch-marks.ts`'s
 * module-level store, and the *watched up to here* control's visibility is computed from
 * the store rather than from the server's copy — `mark-up-to.ts`'s `withLiveWatched`
 * carries the bug that rule exists to fix, and it is exactly as live here as it is on the
 * season list. So the boundary would have to be drawn somewhere below the heading anyway,
 * and drawing it around the still, two `<p>`s and one `<h1>` to keep four static lines on
 * the server buys nothing a reader can see.
 *
 * `synopsis` is the exception, and it is the whole reason this takes a `ReactNode`: it is
 * an **already-rendered Server Component** handed down from `page.tsx`
 * (`episode-synopsis-streamed.tsx`), so its `Suspense` boundary and its TMDB read stay on
 * the server and stream in behind this shell. `TitleDetailView` takes `liveFacts` the same
 * way for the same reason.
 *
 * ── The whole show's episode list crosses to the browser, and that is a real cost ────
 *
 * `episodes` is every episode of the show, not just this one, because *watched up to here*
 * is not a question a row can answer about itself: the control is drawn exactly where at
 * least one **earlier** episode is unwatched, and the count the reader confirms is the
 * size of that set. `coveredUpTo` needs the run to compute either.
 *
 * That is a payload — a forty-season show is a long list, and it is now serialised onto a
 * second surface. It is accepted rather than overlooked, on three grounds. It is the
 * **same** list the show's own page already ships for the same show, so this is not a new
 * order of magnitude. It comes from a cache entry that is already resolved, so it costs no
 * second read. And the alternative is asking the server for the count when the control is
 * pressed, which `mark-up-to-dialog.tsx` rules out in as many words: *a round trip in
 * front of a confirmation is a spinner where a number should be.*
 *
 * A narrower type — the four fields `coveredUpTo` actually reads — was the other option and
 * was not taken: `MarkUpToDialog` and the action behind it are to be reused **unchanged**
 * (#253, and #245's *one confirmation sentence and one write behind both*), and they are
 * typed on `EpisodeDetail`. Slimming the list means widening three shipped modules'
 * signatures to earn a saving on a surface that is one tap deep.
 */
export function EpisodeDetailView({
  libraryEntryId,
  titleName,
  episodes,
  located,
  synopsis,
}: {
  readonly libraryEntryId: string;
  /**
   * The show's name — `CONTEXT.md`'s **Title**, *a film or a show as it exists in the
   * world*, which is exactly what this is: a borrowed fact, replaceable by a refresh.
   *
   * The prop keeps that word because that is what the value is and because every mark on
   * this page passes it straight to `WatchNaming.title`, which the lost-write toast reads.
   * What the *page* calls it on the glass is **the series**, which is the word #253 uses —
   * a label above an episode is naming the programme this instalment belongs to, and
   * *title* on a page whose subject already has a title of its own would be two things
   * called the same thing one line apart.
   */
  readonly titleName: string;
  /** Every episode of the show, in `getTitleDetail`'s order. See the docblock above. */
  readonly episodes: readonly EpisodeDetail[];
  /** This episode and its neighbours, already located by `episode-run.ts`. */
  readonly located: EpisodeInRun<EpisodeDetail>;
  /** `episode-synopsis-streamed.tsx`, rendered on the server and handed down whole. */
  readonly synopsis: ReactNode;
  /**
   * There was an `overlaid` flag here until issue #273 — *this surface is drawn over
   * another one*, true of the `@episode` slot's intercepted render (issue #254) and false
   * of the page a direct load landed on. It reached exactly one control, and
   * `EpisodeRunControls` below is where the reversal is argued.
   *
   * There is one render of this route now, so there is nothing for a flag to distinguish.
   */
}) {
  /**
   * The server's list with the marks store laid over it — the input `coveredUpTo` must be
   * given, for the reason `mark-up-to.ts` records: nothing in this application reloads on
   * a landed write, so a control whose visibility was computed from the server's copy
   * would keep offering to record episodes that are already struck.
   */
  const live = useLiveEpisodes(libraryEntryId, episodes);

  /**
   * This episode, as the store currently has it. `live` returns the *same* objects where
   * nothing moved (`withLiveWatched`), so this is the server's row until a mark changes
   * it. The fallback covers nothing reachable — `page.tsx` located this id in the very
   * list being passed in — and is here so a `find` cannot make the page depend on that
   * invariant holding at runtime.
   */
  const episode = live.find((one) => one.id === located.episode.id) ?? located.episode;

  const fullName = episodeFullName(episode);
  const meta = episodeMetaLine(episode);
  const covered = coveredUpTo(live, episode);

  const { watched, phase, pending, attempt, unwatch, settle } = useWatchMark({
    initialWatched: located.episode.watched,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
  });

  /** Mounted only while there is an episode to confirm — `mark-up-to-dialog.tsx`'s own
   *  rule, which keeps one dialog on the page rather than one per row. */
  const [confirming, setConfirming] = useState<{
    readonly through: EpisodeDetail;
    readonly covered: readonly EpisodeDetail[];
  } | null>(null);

  return (
    <div className="px-6 py-5">
      {/* `640` is the measure — `max-w-[40rem]` at the root font size, which is the
          widest this frame is ever drawn. The frame is fluid below that, so a phone draws
          it narrower; the *width* is what `EpisodeStill` sizes the download from, and it
          resolves through `STILL_BUCKETS` to `w780`, the smallest TMDB still that covers
          640 without upscaling. One bucket for every viewport, and never `original`. */}
      {/* `aboveFold`, stated rather than defaulted: this is the first thing on the page,
          unlike the same component on a rail of next-episode cards (#250), where all but
          the first two are lazy. */}
      <EpisodeStill
        stillPath={episode.stillPath}
        width={640}
        className="w-full max-w-[40rem]"
        aboveFold
      />

      {/* The series, in the label register (#253's own words). It is the quietest thing
          on the page and it is first, because the reader arrived from a card or a row and
          needs one line confirming which show this is before the episode's own name. */}
      <p className="label-line mt-5 text-dim">{titleName}</p>

      {/* Season and episode, together, and never as the episode's name. `CONTEXT.md`: an
          episode is never referred to by number alone — the numbers are allowed to be a
          line of their own precisely because the name is the `<h1>` directly beneath. */}
      <p className="code-line mt-2 text-dim" data-numeric>
        {seasonHeading(episode.seasonNo)} · Episode {episode.episodeNo}
      </p>

      {/* The Named Episode Rule. `null` is TMDB not having named it yet, and is not a
          licence to print the number a second time in its place. The dimming that says
          *watched* is the season row's treatment (`WATCHED_NAME`) and is deliberately not
          applied here: this heading is the page's subject and its identity, not a row's
          state line, and a dimmed `<h1>` reads as a disabled page. What says *watched*
          on this surface is the control group below, which offers *Rewatch* and
          *Unwatch* instead of a mark. */}
      {/* `bill-title`, not `screen-title`. `app/globals.css` keeps the two apart on
          purpose — *`screen-title` is **not** `bill-title` at a bigger step … the two
          never appear on the same surface*: `screen-title` is the four phone destinations'
          own register, and `bill-title` is what the bill's names are set in. This page is
          one tap under title detail, whose `<h2>` is `bill-title text-bill-xl`, so it is a
          bill surface and takes the bill's cut one step down. Pairing `screen-title` with
          `text-bill-lg` — which the first draft did — would have been a third register
          nobody declared, on the one surface where nobody would look for it. */}
      <h1 className="bill-title mt-1 text-bill-lg text-ink">
        {episode.name === null ? "Not yet named" : episode.name}
      </h1>

      {meta === null ? null : <p className="mt-2 text-item text-dim">{meta}</p>}

      {/* The one live read on this page, streamed in behind everything above. A failure
          in it renders inside this node and reaches nothing around it. */}
      {synopsis}

      {/* `relative`, so the sweep below is positioned against this group and takes no
          flow space — the same arrangement `EpisodeLine`'s `<li>` makes for the same
          wash. The group is what the sweep washes here because the row does not exist on
          this surface: what a reader is looking at when they press is these controls. */}
      <div className="relative mt-7 flex flex-wrap items-center gap-3">
        {!watched ? (
          /**
           * The daily gesture, and the one primary action on this surface — so
           * `SOLID_RECOVERY` rather than the season row's `RECORDING_HIT_BOX` checkmark.
           * The row's control is a glyph because the row is a fixed measure whose episode
           * name already truncates (`episode-line.ts`); a page has room for the word, and
           * `errors/recovery-buttons.ts` reserves solid accent for exactly one control
           * per surface. Recording a watch is that control here.
           */
          <button
            type="button"
            onClick={() => void attempt()}
            disabled={pending}
            className={`${SOLID_RECOVERY} ${IN_FLIGHT}`}
          >
            Mark watched
          </button>
        ) : phase === "marking" ? (
          // The length of the sweep, and nothing else — controls arrive with `settled`.
          // `EpisodeLine`'s own rule: a control that materialises under a thumb still
          // resting where it pressed is the same mistake as a row that resizes under it.
          <span className="code-line text-dim">Watched</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void attempt()}
              disabled={pending}
              aria-label={`Watch ${fullName} again`}
              className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
            >
              Rewatch
            </button>

            <button
              type="button"
              onClick={() => void unwatch()}
              disabled={pending}
              aria-label={`Unwatch ${fullName}`}
              className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
            >
              Unwatch
            </button>
          </>
        )}

        {/* Offered on both sides of the branch above, exactly as on the season row: a
            watched episode with a gap behind it is precisely the episode this is for.
            `null` from `coveredUpTo` means the control must not be drawn at all — there
            is nothing earlier left to record, and a control over work it would not do is
            the dead control issue #194 asks for the opposite of.

            It carries its words here where the row carries only a glyph. The row's
            trailing slot is a measured `192px` and the label would have cost the episode
            name the characters to pay for it (`programme-note-episodes.tsx`'s `TRAILING`);
            this page has the room, so the control says what it does and
            `markUpToLabel` stays as the `aria-label` so that the spoken form still names
            the episode in full. */}
        {covered === null ? null : (
          <button
            type="button"
            onClick={() => setConfirming({ through: episode, covered })}
            disabled={pending}
            aria-label={markUpToLabel(episode)}
            className={`${QUIET_RECORDING_CONTROL_LABELLED} ${IN_FLIGHT}`}
          >
            Watched up to here
          </button>
        )}

        {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
      </div>

      <EpisodeRunControls libraryEntryId={libraryEntryId} located={located} />

      {confirming === null ? null : (
        /**
         * The existing dialog and the existing write, unchanged — #253's criterion and
         * #245's *one confirmation sentence and one write behind both*. It is handed the
         * live `covered`, so the number the reader agrees to is the number that lands.
         */
        <MarkUpToDialog
          libraryEntryId={libraryEntryId}
          titleName={titleName}
          through={confirming.through}
          covered={confirming.covered}
          onClosed={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/**
 * Previous and next — *move between episodes without returning to the show*.
 *
 * ── The ends of a run draw nothing, rather than something disabled ──────────────────
 *
 * #253 asks that the first and last episode *render without a broken control*, and there
 * are two ways to satisfy that: a control that is present and inert, or no control. This
 * takes the second, on the rule `programme-note-episodes.tsx` already states for *watched
 * up to here* — **a control offered over work it will not do is the dead control issue
 * #194 asks for the opposite of.** A greyed *Previous* on a season premiere is a target a
 * thumb will find and a screen reader will announce, and it answers nothing when pressed.
 *
 * The other control keeps its place either way: the row is a flex with a `justify-between`
 * and a spacer, so *Next* does not slide left across the page when *Previous* is absent.
 *
 * ── They name the destination ───────────────────────────────────────────────────────
 *
 * `CONTEXT.md`'s rule that an episode is never referred to by number alone applies to a
 * link to one as much as to a row of one, so the accessible label is `episodeFullName`.
 * The visible text stays short — the page is read on a phone and two full episode names at
 * the foot of it would be a paragraph — with the name carried in the label, which is the
 * same division `MarkUpToButton` makes between what is drawn and what is spoken.
 */
function EpisodeRunControls({
  libraryEntryId,
  located,
}: {
  readonly libraryEntryId: string;
  readonly located: EpisodeInRun<EpisodeDetail>;
  /**
   * ── Stepping the run took two extra props until issue #273 ────────────────────────
   *
   * In the `@episode` slot these two links were intercepted like every other soft
   * navigation to this route, so the reader stayed in one dialog and its contents
   * changed. That arrived with two problems the page never had, and #254 answered both
   * with an `overlaid` flag: `scroll={false}`, because the originating page behind the
   * backdrop must not be sent to the top, and `replace`, because a pushed entry per
   * episode made Back step backwards through a run instead of dismissing the dialog.
   *
   * Both were **wrong on the page**, which is why they were conditional — and the page
   * is now the only surface. `scroll={false}` here would leave a reader who pressed
   * *Next* at the foot of one episode looking at the foot of a different one, and
   * `replace` would make Back skip past every episode they had read. So the flag is
   * gone and these are two ordinary links, which is what they were before #254.
   */
}) {
  const { previous, next } = located;

  // Both ends at once is a show with exactly one mirrored episode. Nothing to move
  // between, so nothing is drawn — not an empty row holding a control group's space.
  if (previous === null && next === null) return null;

  return (
    <nav aria-label="Episodes" className="mt-8 flex items-center justify-between gap-3">
      {previous === null ? (
        // The spacer that keeps `Next` on the right. `aria-hidden` because an empty cell
        // is layout, and announcing one would be announcing the absence of a control.
        <span aria-hidden />
      ) : (
        <Link
          href={episodePath(libraryEntryId, previous.id)}
          aria-label={`Previous episode: ${episodeFullName(previous)}`}
          className={GHOST_RECOVERY}
        >
          ‹ Previous
        </Link>
      )}

      {next === null ? (
        <span aria-hidden />
      ) : (
        <Link
          href={episodePath(libraryEntryId, next.id)}
          aria-label={`Next episode: ${episodeFullName(next)}`}
          className={GHOST_RECOVERY}
        >
          Next ›
        </Link>
      )}
    </nav>
  );
}
