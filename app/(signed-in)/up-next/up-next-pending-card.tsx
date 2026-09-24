import Link from "next/link";

import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import { PendingLine } from "@/app/pending-line";
import { posterSrc } from "@/app/poster";
import type { UpNextPendingEntry } from "@/db/access";
import { CARD, CARD_WIDTH, FRAME } from "./up-next-episode-card";

/**
 * The head of the next-episodes rail while a title's episodes are still arriving — issue
 * #272, and the phone's half of the pending tile.
 *
 * ── It is `UpNextEpisodeCard`'s box, not a new one ───────────────────────────────────
 *
 * `CARD`, `CARD_WIDTH` and `FRAME` are imported from that file rather than restated, so
 * this card is exactly the width of the cards beside it and its frame is exactly their
 * frame. A pending card at a different measure would make the rail reflow the moment the
 * mirror landed and the card became an ordinary one — the same jump #269 spent a whole
 * ticket removing from the mark.
 *
 * What it does **not** share is the card's body, and that is deliberate: `CardBody` takes
 * an episode code, an episode name, a remainder, an air date and a runtime, and this title
 * has none of them. Threading five nullable props through it to render four absences would
 * put *is this pending?* inside a component whose entire job is to draw an episode.
 *
 * ── What is drawn, and what waits ────────────────────────────────────────────────────
 *
 * The pending principle exactly: **everything already in hand renders at once, at full
 * strength**. The poster and the name are facts the add wrote from the series before it
 * answered the press, so they are drawn — the poster in the card's own 16:9 frame, centre
 * cropped, which is #269's rule for a card with no still and is the same rule here for a
 * card with no episode. The episode line is the one region genuinely unresolved, and it is
 * the one region that says it is waiting.
 *
 * **No skeleton and no shimmer.** §9 forbids both outright and gives four reasons; the one
 * that bites hardest here is the second — a grey rectangle at a poster's measure is already
 * *a title TMDB has no artwork for*, so a skeleton on this rail would be a lie in the
 * vocabulary the rail already speaks. `PendingLine` is the whole treatment, at the radius
 * §9 assigns it, and the card's `rounded-2xl` is the card's, unchanged.
 *
 * ── It links to the title, not to an episode ─────────────────────────────────────────
 *
 * There is no episode to link to. The title's own page is where the reader can watch this
 * resolve, and it draws the same pending treatment over its episode region
 * (`programme-note-episodes.tsx`), so pressing the card leads somewhere that answers the
 * question the card raised rather than to a season list that is empty for a reason it
 * cannot explain.
 *
 * ── No `"use client"`, and it is in the client bundle anyway ────────────────────────
 *
 * `up-next-episode-rail.tsx` imports this, and that rail is a client component because of
 * the marks store, so this module is compiled into the same bundle whatever it declares.
 * The directive is left off because there is nothing here that needs it — no hook, no
 * handler, no state — and adding one would claim a boundary this file does not own. What it
 * costs is what it weighs, and that is a `Link`, an `<img>` and two paragraphs.
 */
export function UpNextPendingCard({
  entry,
  aboveFold = false,
}: {
  entry: UpNextPendingEntry;
  /** This card is in the rail's first visible run — the rail's to say (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  return (
    <li className={`${CARD} relative overflow-hidden rounded-[var(--radius-6)] bg-raised plate-line`}>
      <Link
        href={`/titles/${entry.libraryEntryId}`}
        className="pressable block"
        /* The frame is `aria-hidden` and the pending line is a live region rather than a
           label, so this is the whole of what a screen reader hears for the link. */
        aria-label={`${entry.titleName} — episodes still arriving`}
      >
        <PendingFrame posterPath={entry.posterPath} aboveFold={aboveFold} />

        <div className="px-[14px] pt-3 pb-1">
          <p className="label-line text-dim">{entry.titleName}</p>

          {/* Where the code line and the remainder sit on an ordinary card. One dim line,
              and no second one. */}
          <div className="mt-[7px]">
            <PendingLine />
          </div>
        </div>
      </Link>

      {/* The mark slot, empty. `min-h-11` is `episode-line.ts`'s 44px floor, kept so that
          this card is the same height as the card it becomes — there is nothing to record
          against a title with no episodes, and a slot that collapsed would move every card
          after it the moment the mirror landed. */}
      <div className="min-h-11" />
    </li>
  );
}

/**
 * The poster, cropped into the card's 16:9 frame — `CardFrame`'s poster branch (#269), at
 * the one measure both cards share.
 *
 * A title with no poster gets the held frame and nothing in it: the
 * missing-artwork rule, and the same `EpisodeStill` with no path that the episode card
 * falls back to. No glyph, no initials, no apology — and, emphatically, no shimmer.
 */
function PendingFrame({
  posterPath,
  aboveFold,
}: {
  posterPath: string | null;
  aboveFold: boolean;
}) {
  if (posterPath === null) {
    return <EpisodeStill stillPath={null} width={CARD_WIDTH} className={FRAME} aboveFold={aboveFold} />;
  }

  return (
    <div className={`still ${FRAME}`}>
      {/* TMDB's CDN, never Vercel's metered optimiser — `app/poster.tsx`'s reasoning. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="block h-full w-full object-cover object-center"
        src={posterSrc(posterPath, CARD_WIDTH)}
        alt=""
        aria-hidden="true"
        loading={aboveFold ? "eager" : "lazy"}
        fetchPriority={aboveFold ? "high" : undefined}
        decoding="async"
      />
    </div>
  );
}
