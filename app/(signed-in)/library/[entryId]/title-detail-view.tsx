"use client";

import { useState } from "react";

import type { TitleDetailRow } from "@/db/access";
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
 */
export function TitleDetailView({ detail }: { detail: TitleDetailRow }) {
  const [current, setCurrent] = useState(detail);

  return (
    <ProgrammeNoteContent
      detail={current}
      onStateChange={(libraryEntryId, state) =>
        setCurrent((prev) => (prev.libraryEntryId === libraryEntryId ? { ...prev, state } : prev))
      }
      onRated={(libraryEntryId, rating) =>
        setCurrent((prev) => (prev.libraryEntryId === libraryEntryId ? { ...prev, rating } : prev))
      }
    />
  );
}
