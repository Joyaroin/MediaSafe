"use client";

import { useState } from "react";

import type { TitleDetailRow } from "@/db/access";
import { ProgrammeNoteContent } from "../programme-note-content";

/**
 * The phone route's thin client shell around `ProgrammeNoteContent` — issue #87 gave that
 * component a way to report a changed `state`, and a page render (the server component
 * this wraps) has nowhere to hold that patch. This is the smallest client boundary that
 * does: seeded from the server's read, and updated only by `AbandonControl`'s own write,
 * the same "patch in place, re-read nothing else" contract `ProgrammeNotePane` holds on
 * desktop.
 */
export function TitleDetailView({ detail }: { detail: TitleDetailRow }) {
  const [current, setCurrent] = useState(detail);

  return (
    <ProgrammeNoteContent
      detail={current}
      onStateChange={(state) => setCurrent((prev) => ({ ...prev, state }))}
    />
  );
}
