"use client";

import type { ReactNode } from "react";

import type { LibraryState, TitleDetailRow } from "@/db/access";
import { STATE_LABELS } from "./library-state";
import { ProgrammeNoteEpisodes } from "./programme-note-episodes";
import { watchProgress } from "./progress-remaining";
import { TitleActions } from "./title-actions";
import { TitleHero } from "./title-hero";
import { titleMetaLine } from "./title-meta-line";
import { nextToWatch } from "./title-page";
import { useLiveEpisodes } from "./use-live-episodes";

/**
 * An owned title's page — issue #357.
 *
 * ── The reading order ────────────────────────────────────────────────────────────────
 *
 * The head (poster, where the title stands, how far through you are) with the one main
 * button under it and the synopsis; then the episodes, with where-to-watch and cast beside
 * them on a desktop. *Remove from library* is in the head's ⋯ menu alone — it was also a
 * section at the very foot until the UI overhaul, two doors to one confirmation.
 *
 * ── The main button reads the live marks ─────────────────────────────────────────────
 *
 * The next episode is not the server's `upNext` flag but `nextToWatch` over the season
 * list's live marks, so marking an episode — from the button or from its row — moves the
 * button on to the following one without a round trip.
 *
 * ── `onStateChange` ──────────────────────────────────────────────────────────────────
 *
 * Patches `detail.state` in whichever component holds these props
 * (`titles/[entryId]/title-detail-view.tsx`). A film's watch, giving up and resuming
 * report through it; nothing else about the title changes when they land, so nothing else
 * is re-read. The entry id travels with it so a write landing after the page has moved on
 * cannot patch a different title.
 *
 * ── The live facts are nodes ─────────────────────────────────────────────────────────
 *
 * `synopsis`, `watchProviders` and `cast` arrive already rendered — streamed Server
 * Components from `title-detail-body.tsx` — so this component knows only where they sit.
 */
export function ProgrammeNoteContent({
  detail,
  synopsis,
  watchProviders,
  cast,
  posterTransitionName,
  onStateChange,
  today,
}: {
  detail: TitleDetailRow;
  synopsis: ReactNode;
  watchProviders: ReactNode;
  cast: ReactNode;
  posterTransitionName: string;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
  /** The reader's calendar day, `YYYY-MM-DD`, for what has aired. */
  today: string;
}) {
  const live = useLiveEpisodes(detail.libraryEntryId, detail.episodes);
  const isShow = detail.kind === "show";

  const progress = isShow && live.length > 0 ? watchProgress(live) : null;
  const nextEpisode = isShow ? nextToWatch(live, today) : null;

  const facts = (
    <>
      {watchProviders}
      {cast}
    </>
  );

  return (
    <div className="pb-10">
      <TitleHero
        name={detail.name}
        posterPath={detail.posterPath}
        posterColour={detail.posterColour}
        posterTransitionName={posterTransitionName}
        libraryEntryId={detail.libraryEntryId}
        status={{
          ...STATE_LABELS[detail.state],
          note: detail.state === "abandoned" ? "Watching it again clears this." : undefined,
        }}
        meta={titleMetaLine(detail)}
        progress={progress}
        synopsis={synopsis}
        actions={
          <TitleActions
            libraryEntryId={detail.libraryEntryId}
            titleId={detail.titleId}
            titleName={detail.name}
            kind={detail.kind}
            state={detail.state}
            nextEpisode={nextEpisode}
            onStateChange={onStateChange}
          />
        }
      />

      <div
        className={`arrive-panel mt-8 grid gap-8 px-gutter lg:px-10 ${
          isShow ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        {isShow ? (
          <section aria-labelledby="episodes-h" className="min-w-0">
            <h2 id="episodes-h" className="bill-title text-bill-lg text-text">
              Episodes
            </h2>
            <ProgrammeNoteEpisodes
              kind={detail.kind}
              episodes={detail.episodes}
              episodesPending={detail.episodesPending}
              libraryEntryId={detail.libraryEntryId}
              titleName={detail.name}
              today={today}
            />
          </section>
        ) : null}

        <div className="flex min-w-0 flex-col gap-2">{facts}</div>
      </div>
    </div>
  );
}
