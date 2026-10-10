"use client";

import Link from "next/link";

import { carryPoster } from "@/app/poster-handoff-memory";

/**
 * A link to a title's own page that **carries its poster there**: `carryPoster` hands the
 * path, and the image already on screen, to the title's loading frame
 * (`titles/[entryId]/pending-poster.tsx`), so the poster is on the next screen the instant
 * it appears. There is no morph — see `up-next-episode-row.tsx`'s `RowFrame` for why.
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
