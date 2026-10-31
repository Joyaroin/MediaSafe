"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { ICON_BUTTON_SQUARE, MENU_ITEM, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/buttons";
import type { EpisodeDetail, LibraryState } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import type { TitleKind } from "@/tmdb/mirror";
import { AddToListControl } from "./add-to-list-control";
import { CheckmarkIcon } from "./checkmark-icon";
import { giveUpAction, resumeAction } from "./give-up-action";
import { episodeFullName } from "./season-grouping";
import { titlePrimaryAction } from "./title-page";
import { useWatchMark } from "./use-watch-mark";
import { watchMarks } from "./watch-marks";

/**
 * An owned title's actions — issue #357: one main button that does the likely next thing,
 * *Add to list* beside it, and a *…* menu for the rarer ones.
 *
 * The main button is `titlePrimaryAction`'s answer, not a branch written here, so the rule
 * for what a title page offers lives in one tested place.
 */
export function TitleActions({
  libraryEntryId,
  titleId,
  titleName,
  kind,
  state,
  nextEpisode,
  onStateChange,
}: {
  libraryEntryId: string;
  titleId: string;
  titleName: string;
  kind: TitleKind;
  state: LibraryState;
  /** The episode the main button offers, read live from the season list's marks. */
  nextEpisode: EpisodeDetail | null;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  const action = titlePrimaryAction({ owned: true, kind, state, nextEpisode });

  return (
    <>
      {action.kind === "mark-episode" ? (
        // Keyed on the episode, so marking one hands the button to the next with fresh state.
        <MarkEpisodeButton
          key={action.episode.id}
          label={action.label}
          episode={action.episode}
          libraryEntryId={libraryEntryId}
          titleName={titleName}
          onRecorded={() => {
            if (state === "abandoned" || state === "watchlist") {
              onStateChange(libraryEntryId, "watching");
            }
          }}
        />
      ) : null}

      {action.kind === "mark-film" || action.kind === "rewatch-film" ? (
        <MarkFilmButton
          label={action.label}
          watched={action.kind === "rewatch-film"}
          libraryEntryId={libraryEntryId}
          titleName={titleName}
          onRecorded={() => onStateChange(libraryEntryId, "finished")}
        />
      ) : null}

      <AddToListControl key={titleId} titleId={titleId} titleName={titleName} />

      <MoreMenu
        libraryEntryId={libraryEntryId}
        titleName={titleName}
        kind={kind}
        state={state}
        onStateChange={onStateChange}
      />
    </>
  );
}

function MarkEpisodeButton({
  label,
  episode,
  libraryEntryId,
  titleName,
  onRecorded,
}: {
  label: string;
  episode: EpisodeDetail;
  libraryEntryId: string;
  titleName: string;
  onRecorded: () => void;
}) {
  const fullName = episodeFullName(episode);
  const { watched, pending, attempt } = useWatchMark({
    initialWatched: episode.watched,
    initialWatches: episode.watches,
    libraryEntryId,
    episodeId: episode.id,
    titleName,
    episodeName: fullName,
    onRecorded,
  });

  return (
    <button
      type="button"
      onClick={attempt}
      disabled={pending || watched}
      aria-label={`Mark ${fullName} watched`}
      className={`${PRIMARY_BUTTON} flex-1`}
    >
      <CheckmarkIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MarkFilmButton({
  label,
  watched,
  libraryEntryId,
  titleName,
  onRecorded,
}: {
  label: string;
  watched: boolean;
  libraryEntryId: string;
  titleName: string;
  onRecorded: () => void;
}) {
  const { pending, attempt } = useWatchMark({
    initialWatched: watched,
    libraryEntryId,
    episodeId: null,
    titleName,
    onRecorded,
  });

  return (
    <button
      type="button"
      onClick={attempt}
      disabled={pending}
      aria-label={watched ? `Record another watch of ${titleName}` : `Mark ${titleName} watched`}
      // Filled only while it is a mark. Once the film is watched the action is *Watch
      // again*, and that is not the one main action of the page any more (Charcoal §8.7).
      className={`${watched ? SECONDARY_BUTTON : PRIMARY_BUTTON} flex-1`}
    >
      <CheckmarkIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * The rarer actions, behind *…*: giving up on a show (or resuming one), and removing the
 * title. A native `<details>` — keyboard-operable and announced as a disclosure without
 * any script of its own. Remove still goes through its confirmation page; this is only
 * the way there.
 */
function MoreMenu({
  libraryEntryId,
  titleName,
  kind,
  state,
  onStateChange,
}: {
  libraryEntryId: string;
  titleName: string;
  kind: TitleKind;
  state: LibraryState;
  onStateChange: (libraryEntryId: string, state: LibraryState) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  const givenUp = state === "abandoned";

  /**
   * `resuming` is the intent of the press, carried into its own retry — a *Try again* must
   * repeat what was pressed, not re-read a state that may have moved on since.
   */
  async function toggleGiveUp(resuming: boolean, before: LibraryState): Promise<void> {
    detailsRef.current?.removeAttribute("open");
    setPending(true);

    // Optimistic: the pill changes on the press, and a lost write puts it back.
    if (!resuming) onStateChange(libraryEntryId, "abandoned");

    const outcome = resuming ? await resume(libraryEntryId) : await giveUp(libraryEntryId);
    setPending(false);

    if (!outcome.ok) {
      onStateChange(libraryEntryId, before);
      if (raised.current?.standing()) return;
      raised.current = writeFailures.raise({
        title: titleName,
        reference: outcome.reference,
        retry: () => void toggleGiveUp(resuming, before),
      });
      return;
    }

    raised.current?.resolve();
    raised.current = null;
    // Resuming lands wherever the watches say — only the server's derived view knows.
    if (outcome.state !== undefined) onStateChange(libraryEntryId, outcome.state);
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="More actions"
        className={`${ICON_BUTTON_SQUARE} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="currentColor">
          <circle cx="5.5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18.5" cy="12" r="1.8" />
        </svg>
      </summary>

      {/* The list page's menu, the same panel (Charcoal §8: menus are `raised` with `44px`
          rows). It opens to the left now because the button is the row's last.
          `menu-transition` (issue #439) grows it from the summary button's top-right
          corner — pure CSS, nothing wired here but the class. */}
      <div className="menu-transition absolute right-0 z-20 mt-2 flex w-60 flex-col rounded-[var(--radius-4)] bg-raised plate-line p-1.5">
        {kind === "film" && state === "finished" ? (
          <FilmUnwatchItem
            libraryEntryId={libraryEntryId}
            titleName={titleName}
            onUnwatched={() => {
              detailsRef.current?.removeAttribute("open");
              onStateChange(libraryEntryId, "watchlist");
            }}
          />
        ) : null}
        {kind === "show" ? (
          <button
            type="button"
            onClick={() => void toggleGiveUp(givenUp, state)}
            disabled={pending}
            className={`${MENU_ITEM} text-text`}
          >
            {givenUp ? "Resume watching" : "Give up on this show"}
          </button>
        ) : null}
        <Link
          href={`/titles/${libraryEntryId}/remove`}
          aria-label={`Remove ${titleName} from your library`}
          className={`${MENU_ITEM} text-danger`}
        >
          Remove from library
        </Link>
      </div>
    </details>
  );
}

/**
 * Taking back a film's watches — the one thing a watched film's old row offered that the
 * main button does not. Every watch of it goes, the same write the episode menu's
 * *Unwatch* makes.
 */
function FilmUnwatchItem({
  libraryEntryId,
  titleName,
  onUnwatched,
}: {
  libraryEntryId: string;
  titleName: string;
  onUnwatched: () => void;
}) {
  const { pending, unwatch } = useWatchMark({
    initialWatched: true,
    libraryEntryId,
    episodeId: null,
    titleName,
  });

  async function takeBack(): Promise<void> {
    await unwatch();
    // `unwatch` resolves either way; the store says whether it landed. A lost write has
    // already put the mark back and raised its toast, so the state is left alone.
    if (watchMarks.read({ libraryEntryId, episodeId: null })?.watched === false) onUnwatched();
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void takeBack()}
      className={`${MENU_ITEM} text-text`}
    >
      Mark as not watched
    </button>
  );
}

type ToggleOutcome =
  | { readonly ok: true; readonly state?: LibraryState }
  | { readonly ok: false; readonly reference: string | null };

async function giveUp(libraryEntryId: string): Promise<ToggleOutcome> {
  try {
    return await giveUpAction(libraryEntryId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "give-up" }) };
  }
}

async function resume(libraryEntryId: string): Promise<ToggleOutcome> {
  try {
    return await resumeAction(libraryEntryId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "resume" }) };
  }
}
