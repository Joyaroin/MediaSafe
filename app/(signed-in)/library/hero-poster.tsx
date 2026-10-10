"use client";

import { Poster } from "@/app/poster";
import { carriedShownFor } from "@/app/poster-handoff-memory";
import { HERO_POSTER_MEASURE } from "./hero-poster-measure";

/**
 * The title hero's poster — drawn by the hero (`title-hero.tsx`) **and** by its pending
 * frame (`titles/[entryId]/pending-poster.tsx`), so the two are the same element in every
 * respect: size, image file, radius and shadow (UI overhaul).
 *
 * ── Why the morph jerked ─────────────────────────────────────────────────────────────
 *
 * A press runs two view transitions: the list poster morphs into the pending frame's, and
 * when the read resolves the pending frame's swaps for the hero's. The two ends used to
 * differ on everything — `w92`–`w185` on the list, `w154` on the frame, `w342` on the hero,
 * a shadow on the hero alone — so each landing was on an image not yet downloaded (an empty
 * box, then a pop) and the second swap visibly changed size, picture and shadow.
 *
 * Now both ends request the same file, and both draw the image the pressed poster was
 * already showing (`carriedShownFor`) underneath it until it arrives. The landing always
 * has a picture, and the swap from frame to hero changes nothing.
 */
export function HeroPoster({
  libraryEntryId,
  posterPath,
  name,
}: {
  /** The entry whose carried image to draw underneath; absent on the catalogue page. */
  readonly libraryEntryId?: string;
  readonly posterPath: string | null;
  readonly name?: string;
}) {
  return (
    <div className={HERO_POSTER_MEASURE}>
      <Poster
        posterPath={posterPath}
        name={name}
        width={200}
        className="w-full shadow-[0_24px_48px_rgb(0_0_0/0.35)] [--poster-radius:var(--radius-4)]"
        placeholderSrc={libraryEntryId === undefined ? null : carriedShownFor(libraryEntryId)}
        aboveFold
      />
    </div>
  );
}
