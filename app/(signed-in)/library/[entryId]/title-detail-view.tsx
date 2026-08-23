"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { TitleDetailRow } from "@/db/access";
import { groupPosterTransitionName } from "../poster-transition-name";
import { ProgrammeNoteContent } from "../programme-note-content";

/**
 * The phone route's thin client shell around `ProgrammeNoteContent` — issue #87 gave that
 * component a way to report a changed `state`, and a page render (the server component
 * this wraps) has nowhere to hold that patch. This is the smallest client boundary that
 * does: seeded from the server's read, and updated only by the writes on the page itself
 * — `AbandonControl`'s, and issue #113's `RatingControl` — the same "patch in place,
 * re-read nothing else" contract `ProgrammeNotePane` holds on desktop.
 *
 * The entry-id guard is carried here too, even though this route unmounts on a back press
 * where the pane never navigates. It costs one comparison, and it means the two callers
 * of `ProgrammeNoteContent` answer a landed write identically rather than one of them
 * relying on a topology property to be safe.
 *
 * `posterTransitionName` is `group-poster-{id}` — issue #141, and the half of the morph
 * this route owns. `GroupTile` carries the other half; both name families and the reason
 * this one differs from the desktop pane's `rail-poster-{id}` are on
 * `programme-note-content.tsx`'s own docblock. Next's route navigations are transitions
 * on their own — Next's [View transitions guide](https://nextjs.org/docs/app/guides/view-transitions)
 * says so — so nothing here has to ask for one the way the desktop pane's `select` does.
 */
export function TitleDetailView({
  detail,
  liveFacts,
}: {
  detail: TitleDetailRow;
  liveFacts: ReactNode;
}) {
  const [current, setCurrent] = useState(detail);

  return (
    <ProgrammeNoteContent
      detail={current}
      liveFacts={liveFacts}
      posterTransitionName={groupPosterTransitionName(current.libraryEntryId)}
      onStateChange={(libraryEntryId, state) =>
        setCurrent((prev) => (prev.libraryEntryId === libraryEntryId ? { ...prev, state } : prev))
      }
      onRated={(libraryEntryId, rating) =>
        setCurrent((prev) => (prev.libraryEntryId === libraryEntryId ? { ...prev, rating } : prev))
      }
    />
  );
}
