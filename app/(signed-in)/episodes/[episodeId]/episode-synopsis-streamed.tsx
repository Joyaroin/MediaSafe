import { Suspense } from "react";

import { readEpisodeSynopsis } from "@/app/(signed-in)/library/live-facts";
import {
  EpisodeSynopsisFactSection,
  LiveFactPlaceholder,
} from "@/app/(signed-in)/library/live-title-facts";
import type { UserId } from "@/db/access";

/**
 * The episode's own synopsis, streamed in behind the page rather than gating it — the same
 * shape `live-title-facts-streamed.tsx` gives the title page's three live sections, over
 * one read instead of three.
 *
 * ── Why it streams, on a page with only one live read ───────────────────────────────
 *
 * The argument does not weaken with the count; if anything it sharpens. Everything else on
 * this page — the still, the series, the numbers, the name, the date and runtime, and every
 * control — comes out of `cachedTitleDetail`, a Postgres read that is usually already
 * cached. The synopsis is a call to TMDB with an 8-second timeout on it
 * (`REQUEST_TIMEOUT_MS`). Awaiting it in `page.tsx` would mean a reader who tapped an
 * episode card watches a blank route for as long as TMDB takes, to see facts that were
 * ready immediately — and, on a timeout, watches it for eight seconds before the page
 * arrives at all.
 *
 * Inside a `Suspense`, the shell ships at once and this section fills in under it. The
 * `page.tsx` that builds this node never awaits it, exactly as the title route never
 * awaits `LiveTitleFactsStreamed`.
 *
 * ── The failure is inside the boundary, not around it ──────────────────────────────
 *
 * `readEpisodeSynopsis` never rejects — it returns an `Outcome` — so this boundary is only
 * ever about *slow*, never about *failed*. A failure arrives as data and is drawn by
 * `EpisodeSynopsisFactSection` as one section's inline treatment with a reference id,
 * which is what keeps a TMDB outage from touching anything else on the page. That split is
 * `live-facts.ts`'s whole subject and this file relies on it rather than restating it.
 *
 * ── `userId` is a prop and stops here ──────────────────────────────────────────────
 *
 * The read is cached and every cache key in this application carries an account, so one
 * has to reach it. `page.tsx` has already resolved a `UserId` through `requireUserId`, so
 * it arrives as a prop rather than being resolved a second time. What crosses to the
 * browser is the resolved `Outcome` and nothing else — `EpisodeSynopsisFactSection` is a
 * client component and takes no account, because its *Try again* is a Server Action that
 * resolves its own.
 */
export function EpisodeSynopsisStreamed({
  userId,
  tmdbId,
  seasonNo,
  episodeNo,
}: {
  userId: UserId;
  tmdbId: number;
  seasonNo: number;
  episodeNo: number;
}) {
  return (
    <Suspense
      // Keyed by the episode, so moving to the next one through this page's own
      // previous/next controls remounts the section rather than reconciling a resolved
      // outcome from the episode before it into a boundary for a different one.
      key={`episode-synopsis:${tmdbId}:${seasonNo}:${episodeNo}`}
      fallback={<LiveFactPlaceholder heading="Synopsis" />}
    >
      <SynopsisBoundary
        userId={userId}
        tmdbId={tmdbId}
        seasonNo={seasonNo}
        episodeNo={episodeNo}
      />
    </Suspense>
  );
}

async function SynopsisBoundary({
  userId,
  tmdbId,
  seasonNo,
  episodeNo,
}: {
  userId: UserId;
  tmdbId: number;
  seasonNo: number;
  episodeNo: number;
}) {
  const initial = await readEpisodeSynopsis(userId, tmdbId, seasonNo, episodeNo);
  return (
    <EpisodeSynopsisFactSection
      tmdbId={tmdbId}
      seasonNo={seasonNo}
      episodeNo={episodeNo}
      initial={initial}
    />
  );
}
