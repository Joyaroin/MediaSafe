"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { useState } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { stillSrc } from "@/app/(signed-in)/library/episode-still";
import { PRIMARY_BUTTON_LARGE, SECONDARY_BUTTON } from "@/app/buttons";
import { posterSrc } from "@/app/poster";
import { carryPoster } from "@/app/poster-handoff-memory";
import {
  posterBandStyle,
  TONIGHT_SCRIM_LAYOUT,
  tonightScrimGradient,
  tonightScrimVars,
  tonightTitleScrimGradient,
} from "@/app/poster-tint";
import { RECORDS_A_WATCH } from "@/app/accent-meaning";
import { smooth } from "@/app/motion";
import { Roll } from "@/app/roll";
import type { UpNextEntry } from "@/db/access";
import { episodeCode } from "./episode-card-line";
import { finishFactsFor, finishLine, WATCHED } from "./finish-line";
import { UndoRing, useHold } from "./up-next-card";
import { markLabel, pressWithPulse, shownFor } from "./up-next-episode-row";
import {
  featuredPicture,
  queuedEpisodeFullName,
  seasonProgress,
  useUpNextMark,
  type CardPicture,
  type SeasonProgress,
  type UpNextMark,
} from "./up-next-mark";

/**
 * Tonight's featured episode — Charcoal, issue #400 (handoff §8.1).
 *
 * The show watched most recently (`featuredId`, `tonight-surface.tsx`), drawn over its own
 * artwork: an area at least `344px` high (`480px` between `lg:` and `xl:`; the left column's
 * full height from `xl:`), *Tonight* in white serif at its top, and anchored to its foot
 * the *Up next* label, the title at Display size, the episode line, the season's segments
 * and one `56px` filled *Mark watched*.
 *
 * ── One store, so it marks exactly as a row does ─────────────────────────────────────
 *
 * It reads `useUpNextMark` and `shownFor` like `UpNextEpisodeRow`, so a mark here holds,
 * takes an Undo, advances to the next episode, and — on the last aired episode — finishes,
 * exactly as it did when it was a wide row. When it finishes it stops being featured
 * (`useEntriesOnRail` drops it) and the next show in the list takes its place.
 *
 * ── Text over artwork, measured from the text ────────────────────────────────────────
 *
 * The artwork can be anything, so the text never sits on it bare (handoff §10). The
 * `ground` scrim is the text block's own background, its top padding the scrim's fade, so
 * it is `90%` at the label and solid below it however tall the block grows; a title that
 * wraps grows the area downward rather than climbing into the artwork. The black scrim is
 * the screen title's own background, ending `goneBelow` under it. `TONIGHT_SCRIM` holds
 * both, and `tests/poster-tint.test.ts` composites them over white and black artwork.
 *
 * The section's own top padding keeps the `ground` scrim from ever reaching up under the
 * white *Tonight* — in the light theme `ground` is pale, and white on it would fail.
 * `tests/e2e/up-next-featured.spec.ts` measures that.
 *
 * ── Nothing teleports — issue #407 (handoff §11.2) ───────────────────────────────────
 *
 * A mark narrows *Mark watched* into a `56px` filled tick at its left edge, with *Watched*
 * beside it and a quiet *Undo* at the right end, and the ring draining round the tick for
 * as long as *Undo* is offered (`FeaturedMark`). In the same beat the season's segment fills
 * and the count rolls. When the hold ends the tick widens back into the button, for the next
 * episode, and only the episode line rolls; the title and the artwork stay still. A press
 * that finishes a season rolls the line into the finish line, in italic serif, and the
 * segments close their gaps into one bar for the hold.
 *
 * The narrowing and the joining are Motion's layout animation on `smooth` — a size changing
 * is never animated as a `width` or a `gap` — and the rolls are CSS on `--dur-roll`. Under
 * reduced motion `MotionConfig` drops the layout animation and the rolls run for `1ms`:
 * everything changes at once.
 */
export function TonightFeatured({ entry }: { entry: UpNextEntry }) {
  const mark = useUpNextMark(entry);

  useHold(mark.held?.episodeId ?? null, mark.settle);

  const markable = entry.queue.episodes.length > 0;
  const shown = markable ? shownFor(entry, mark) : null;
  const showing = shown?.showing ?? null;

  const code =
    showing === null
      ? episodeCode(entry.seasonNo, entry.episodeNo)
      : episodeCode(showing.seasonNo, showing.episodeNo);
  const episodeName = showing === null ? entry.episodeName : showing.episodeName;
  const progress = seasonProgress(entry, showing, shown?.marked ?? 0);
  const held = mark.held === null ? null : finishLine(finishFactsFor(entry, mark.held));
  /* The finish line replaces the episode line for the hold; a plain mark leaves the line on
     the episode just recorded, and *Watched* is said beside the tick instead. */
  const finish = held === null || held === WATCHED ? null : held;
  const press = pressWithPulse(entry, mark);
  const episodeLine = episodeName === null ? code : `${code} · ${episodeName}`;

  return (
    <section
      data-featured=""
      aria-labelledby="tonight-featured-title"
      className={`relative isolate flex min-h-[344px] flex-col justify-end overflow-hidden pt-14 lg:min-h-[480px] lg:rounded-[var(--radius-6)] xl:h-full xl:pt-16 ${TONIGHT_SCRIM_LAYOUT}`}
      style={{ ...tonightScrimVars(), ...posterBandStyle(entry.posterColour) }}
    >
      <FeaturedArtwork picture={featuredPicture(entry, showing)} />

      {/* The screen's one `h1`, white over the artwork's top on its own black scrim. */}
      <div
        className="absolute inset-x-0 top-0 px-gutter pt-6 pb-[var(--tonight-gone)] xl:px-8 xl:pt-7"
        style={{ backgroundImage: tonightTitleScrimGradient() }}
      >
        <h1 className="bill-title text-bill-lg leading-none text-white xl:text-[2rem]">Tonight</h1>
      </div>

      <div
        data-tonight-text=""
        className="relative px-gutter pt-[var(--tonight-fade)] pb-5 xl:px-8 xl:pb-8"
        style={{ backgroundImage: tonightScrimGradient() }}
      >
        <p className="label-line text-text">Up next</p>

        <h2
          id="tonight-featured-title"
          className="bill-title mt-1.5 line-clamp-2 text-display leading-[0.9] text-text"
        >
          <Link
            href={`/titles/${entry.libraryEntryId}`}
            onClick={(event) =>
              carryPoster(entry.libraryEntryId, entry.posterPath, event.currentTarget)
            }
            aria-label={`${entry.titleName} — ${code}${episodeName === null ? "" : `, ${episodeName}`}`}
            className="hover:opacity-90"
          >
            {entry.titleName}
          </Link>
        </h2>

        {/* One fixed line box, so the finish line's larger italic never moves what is
            under it. */}
        <div className="mt-2 flex h-6 items-baseline justify-between gap-3">
          {/* Only this line rolls when the hold ends: the episode just recorded lifts out and
              the next one rises in. A season's finish rolls in the same way, in its place. */}
          <Roll rollKey={finish ?? episodeLine} className="min-w-0">
            <p
              className={`truncate leading-6 font-medium ${
                finish === null
                  ? "text-row text-text"
                  : `finish-line text-bill-md ${RECORDS_A_WATCH.ink}`
              }`}
            >
              {finish ?? episodeLine}
            </p>
          </Roll>
          <Roll rollKey={`${progress.watched}/${progress.released}`} className="shrink-0">
            <p className="text-meta text-dim" data-numeric>
              {progress.watched} of {progress.released}
            </p>
          </Roll>
        </div>

        <SeasonSegments progress={progress} joined={finish !== null} />

        <div className="mt-4">
          <FeaturedMark
            entry={entry}
            mark={mark}
            press={press}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * *Mark watched*, and the held control it narrows into — `HeldControl`, redrawn for the
 * featured episode (handoff §11.2, issue #407).
 *
 * The button and the held tick are one shape to Motion (`layoutId`), so a mark is the
 * button narrowing from its full width to a `56px` circle at its left edge, and the end of
 * the hold is the circle widening back. The tick is drawn, not offered, as on a row: a
 * `span`, since the next episode is not on show yet. *Watched* (Row size) and *Undo* fade in
 * beside it on a token; the ring drains round it while *Undo* is offered.
 *
 * `borderRadius` is in `style` so Motion keeps the corners round through the scale, and the
 * content is `layout` too, so the check and the label are never stretched.
 */
function FeaturedMark({
  entry,
  mark,
  press,
}: {
  entry: UpNextEntry;
  mark: UpNextMark;
  press: UpNextMark;
}) {
  const shape = `featured-mark-${entry.libraryEntryId}`;

  if (mark.held !== null) {
    return (
      <div className="flex h-14 items-center gap-4">
        <m.span
          layoutId={shape}
          transition={smooth}
          aria-hidden="true"
          data-held-tick=""
          className="relative flex size-14 shrink-0 items-center justify-center bg-text text-ground"
          style={{ borderRadius: FEATURED_TICK_RADIUS }}
        >
          <m.span layout transition={smooth} className="flex">
            <CheckmarkIcon className="h-6 w-6" />
          </m.span>
          {mark.undoable === null ? null : <UndoRing outset={5} />}
        </m.span>
        <p className="held-reveal text-row font-semibold text-text">Watched</p>
        {mark.undoable === null ? null : (
          <button
            type="button"
            onClick={mark.undo}
            aria-label={`Undo marking ${queuedEpisodeFullName(mark.held)} watched`}
            className={`held-reveal ml-auto ${SECONDARY_BUTTON}`}
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  if (press.episode === null) return null;

  return (
    <m.button
      layoutId={shape}
      transition={smooth}
      type="button"
      onClick={press.mark}
      disabled={press.pending}
      aria-label={markLabel(entry.titleName, press.episode)}
      className={`${PRIMARY_BUTTON_LARGE} w-full overflow-hidden sm:w-auto sm:min-w-[280px]`}
      style={{ borderRadius: FEATURED_BUTTON_RADIUS }}
    >
      <m.span layout transition={smooth} className="flex items-center gap-2 whitespace-nowrap">
        <CheckmarkIcon className="h-5 w-5" />
        Mark watched
      </m.span>
    </m.button>
  );
}

/** `PRIMARY_BUTTON_LARGE`'s own corner, `--radius-5`, as Motion needs it: a number. */
const FEATURED_BUTTON_RADIUS = 16;

/** Half the `56px` circle. */
const FEATURED_TICK_RADIUS = 28;

/**
 * The artwork, behind everything: the band (handoff §10), which also shows while the
 * picture loads or when there is none, and over it the picture `featuredPicture` chooses —
 * the episode's still, then the title's poster — cropped to the area.
 *
 * **A picture that fails to load is taken away**, so the band shows rather than the
 * browser's broken-image box: TMDB does drop paths. `failed` remembers *which* source
 * failed, so the next episode's still is tried afresh. The ref catches a failure that
 * happened before hydration, which `onError` — attached by React only once it has
 * hydrated — never hears about.
 */
function FeaturedArtwork({ picture }: { picture: CardPicture }) {
  const src =
    picture.kind === "still"
      ? stillSrc(picture.path, ARTWORK_WIDTH)
      : picture.kind === "poster"
        ? posterSrc(picture.path, ARTWORK_WIDTH)
        : null;
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 bg-[var(--band,var(--color-raised))]"
    >
      {src === null || failed === src ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- the TMDB CDN, read with a plain <img> for `poster.tsx`'s stated reasons; cropped to the area, which `Poster`'s 2/3 box cannot do
        <img
          src={src}
          alt=""
          onError={() => setFailed(src)}
          ref={(image) => {
            if (image !== null && image.complete && image.naturalWidth === 0) setFailed(src);
          }}
          decoding="async"
          // The first thing on the landing screen: never lazy.
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/** Wide enough for the desktop's left column, which both CDN ladders bucket to `w780`. */
const ARTWORK_WIDTH = 780;

/**
 * The season's progress — handoff §6: one `4px` segment per aired episode, `4px` apart,
 * watched in `text` and the rest in `segment-rest`. It moves as the mark lands, because
 * `progress` is derived from the episode on show; the fill is a colour transition on
 * `--dur-roll`, the count's beat.
 *
 * `joined` is a season's finish (issue #407): the gaps close and the segments become one
 * bar for the hold. Each segment is a Motion `layout` element, so closing the gap is their
 * positions and sizes animating on `smooth` — the `gap` itself is never animated.
 */
function SeasonSegments({
  progress,
  joined,
}: {
  progress: SeasonProgress;
  joined: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${progress.watched} of ${progress.released} episodes this season watched`}
      data-joined={joined ? "" : undefined}
      className={`mt-2.5 flex ${joined ? "gap-0" : "gap-1"}`}
    >
      {Array.from({ length: progress.released }, (_, index) => (
        <m.span
          key={index}
          layout
          transition={smooth}
          data-watched={index < progress.watched ? "" : undefined}
          className={`h-1 flex-1 transition-colors duration-[var(--dur-roll)] ${
            index < progress.watched ? "bg-text" : "segment-rest"
          }`}
          style={{ borderRadius: joined ? 0 : SEGMENT_RADIUS }}
        />
      ))}
    </div>
  );
}

/** Half the segment's `4px` height — a pill until the segments join. */
const SEGMENT_RADIUS = 2;
