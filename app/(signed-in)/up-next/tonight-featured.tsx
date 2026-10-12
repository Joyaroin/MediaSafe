"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { useState } from "react";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { stillSrc } from "@/app/(signed-in)/library/episode-still";
import { PRIMARY_BUTTON_LARGE } from "@/app/buttons";
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
import { exit, snappy } from "@/app/motion";
import type { UpNextEntry } from "@/db/access";
import { episodeCode } from "./episode-card-line";
import { finishFactsFor, finishLine, WATCHED } from "./finish-line";
import { HeldControl, useHold } from "./up-next-card";
import { markLabel, pressWithPulse, shownFor } from "./up-next-episode-row";
import {
  featuredPicture,
  queuedEpisodeFullName,
  seasonProgress,
  useUpNextMark,
  type CardPicture,
  type SeasonProgress,
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
  const press = pressWithPulse(entry, mark);

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

        <div className="mt-2 flex items-baseline justify-between gap-3">
          {/* Keyed on the code, as the row's episode line is: an advance is the old episode
              lifting out and the next one rising in, and the hold's line enters and leaves
              the same way — the motion this had as a wide row, kept rather than added. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={held !== null ? `${code}-held` : code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: exit }}
              transition={snappy}
              className="min-w-0"
            >
              {/* The travel is the wrapper's, never the line's own, so under reduced motion
                  the finish line itself does not move — its entrance is opacity alone. */}
              <p
                className={`truncate text-row font-medium ${
                  held === null
                    ? "text-text"
                    : `${RECORDS_A_WATCH.ink}${held === WATCHED ? "" : " finish-line"}`
                }`}
              >
                {held !== null ? held : episodeName === null ? code : `${code} · ${episodeName}`}
              </p>
            </m.div>
          </AnimatePresence>
          <p className="shrink-0 text-meta text-dim" data-numeric>
            {progress.watched} of {progress.released}
          </p>
        </div>

        <SeasonSegments progress={progress} />

        <div className="mt-4">
          {mark.held !== null ? (
            <HeldControl
              onUndo={mark.undoable === null ? null : mark.undo}
              undoLabel={`Undo marking ${queuedEpisodeFullName(mark.held)} watched`}
            />
          ) : press.episode === null ? null : (
            <button
              type="button"
              onClick={press.mark}
              disabled={press.pending}
              aria-label={markLabel(entry.titleName, press.episode)}
              className={`${PRIMARY_BUTTON_LARGE} w-full sm:w-auto sm:min-w-[280px]`}
            >
              <CheckmarkIcon className="h-5 w-5" />
              Mark watched
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

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
        // eslint-disable-next-line @next/next/no-img-element -- the TMDB CDN, read with a plain <img> for `poster.tsx`'s stated reasons; cropped to the area, which neither `Poster`'s 2/3 box nor `EpisodeStill`'s 16/9 one can do
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
 * `progress` is derived from the episode on show.
 */
function SeasonSegments({ progress }: { progress: SeasonProgress }) {
  return (
    <div
      role="img"
      aria-label={`${progress.watched} of ${progress.released} episodes this season watched`}
      className="mt-2.5 flex gap-1"
    >
      {Array.from({ length: progress.released }, (_, index) => (
        <span
          key={index}
          data-watched={index < progress.watched ? "" : undefined}
          className={`h-1 flex-1 rounded-[var(--radius-full)] ${
            index < progress.watched ? "bg-text" : "segment-rest"
          }`}
        />
      ))}
    </div>
  );
}
