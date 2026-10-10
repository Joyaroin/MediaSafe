"use client";

import Link from "next/link";

import { carryPoster } from "@/app/poster-handoff-memory";
import { railPosterTransitionName } from "./poster-transition-name";

/**
 * A link to a title's own page that **carries its poster there** — the UI overhaul's
 * *every poster morphs*. Up next's cards and the Library grid did this already; You's
 * tiles and a list's icons and rows opened the same page with a hard cut.
 *
 * Two halves, the same two `selectable-entry.tsx` has. `carryPoster` hands the path to the
 * pending frame (`titles/[entryId]/pending-poster.tsx`), so a slow read still has a poster
 * to land on. `posterMorph` names the poster on this side so the browser pairs it with the
 * hero's — a plain `viewTransitionName` style rather than React's `<ViewTransition>`, which
 * keeps every caller renderable under Vitest (`selectable-entry.tsx` has the reasoning).
 *
 * A server component can render this: it is the client boundary, and the callers stay on
 * the side of it they were on.
 */
export function PosterLink({
  libraryEntryId,
  posterPath,
  className,
  children,
}: {
  readonly libraryEntryId: string;
  readonly posterPath: string | null;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Link
      href={`/titles/${libraryEntryId}`}
      onClick={(event) => carryPoster(libraryEntryId, posterPath, event.currentTarget)}
      className={className}
    >
      {children}
    </Link>
  );
}

/** The style that names a poster for the morph — set on the element wrapping `Poster`. */
export function posterMorph(libraryEntryId: string): React.CSSProperties {
  return {
    viewTransitionName: railPosterTransitionName(libraryEntryId),
    viewTransitionClass: "poster",
  };
}
