"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { TitleDetailRow } from "@/db/access";
import { railPosterTransitionName } from "../poster-transition-name";
import { ProgrammeNoteContent } from "../programme-note-content";

/**
 * The phone route's thin client shell around `ProgrammeNoteContent` — issue #87 gave that
 * component a way to report a changed `state`, and a page render (the server component
 * this wraps) has nowhere to hold that patch. This is the smallest client boundary that
 * does: seeded from the server's read, and updated only by the one write on the page that
 * changes a state — a film's watched mark (`film-watch-row.tsx`) — the same "patch in
 * place, re-read nothing else" contract `ProgrammeNotePane` holds on desktop.
 *
 * It held two patches until recently. `AbandonControl` and `RatingControl` are both
 * retired, so `onRated` is gone with the second of them and `onStateChange` has one caller
 * left rather than two.
 *
 * The entry-id guard is carried here too, even though this route unmounts on a back press
 * where the pane never navigates. It costs one comparison, and it means the two callers
 * of `ProgrammeNoteContent` answer a landed write identically rather than one of them
 * relying on a topology property to be safe.
 *
 * `posterTransitionName` is `rail-poster-{id}` — issue #141, and the half of the morph
 * this route owns.
 *
 * > **⚠️ This reverses what this file said until #275**, which was: *this route holds
 * > `group-poster-{id}`, a second family, and it currently has no other half — the tile
 * > that minted the matching name was deleted, so the browser runs no morph into this
 * > page.* The second family existed because the phone had two destinations, a sheet and
 * > a route; #268 deleted the sheet and both interceptions, so there is one destination
 * > and one family. `poster-transition-name.ts` carries the whole argument.
 *
 * The other half is live again, and it is the rail tile: an Up next tile now navigates
 * here, under the same name, so the poster the reader touched travels into this page's
 * hero. Next's route navigations are transitions on their own — Next's
 * [View transitions guide](https://nextjs.org/docs/app/guides/view-transitions) says so —
 * so nothing here has to ask for one the way the desktop pane's `select` does.
 */
export function TitleDetailView({
  detail,
  synopsis,
  watchProviders,
  cast,
}: {
  detail: TitleDetailRow;
  /** The synopsis, already streamed on the server — it renders inside the hero's card. */
  synopsis: ReactNode;
  /** The watch providers, streamed separately now that the two no longer sit together. */
  watchProviders: ReactNode;
  /** Cast, streamed separately because title detail puts it last. */
  cast: ReactNode;
}) {
  const [current, setCurrent] = useState(detail);

  return (
    <ProgrammeNoteContent
      detail={current}
      synopsis={synopsis}
      watchProviders={watchProviders}
      cast={cast}
      posterTransitionName={railPosterTransitionName(current.libraryEntryId)}
      onStateChange={(libraryEntryId, state) =>
        setCurrent((prev) => (prev.libraryEntryId === libraryEntryId ? { ...prev, state } : prev))
      }
    />
  );
}
