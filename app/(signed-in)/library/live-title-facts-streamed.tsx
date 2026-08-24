import { Suspense } from "react";

import type { UserId } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import { readCastAndCrew, readSynopsis, readWatchProviders } from "./live-facts";
import {
  CastAndCrewFactSection,
  LiveFactPlaceholder,
  SynopsisFactSection,
  WatchProvidersFactSection,
} from "./live-title-facts";

/**
 * The phone route's and the unowned-title page's title facts — a **Server Component**,
 * issue #218's answer for the two surfaces that are real page renders. `live-title-facts.tsx`'s
 * own top docblock is the fuller account; this file is the half of it that streams.
 *
 * Each of the three reads gets its own `<Suspense>`, wrapping a tiny async Server
 * Component that awaits exactly one field and hands the resolved `Outcome<T>` to the
 * matching `*FactSection` client component (`live-title-facts.tsx`). That split is what
 * lets the page shell — poster, title, episodes, everything `getTitleDetail`/
 * `getUnownedTitleDetail` already answered — ship the moment the mirrored read is done,
 * with each live section streaming in independently as its own TMDB call resolves,
 * instead of the whole page waiting on the slowest of the three.
 *
 * `key` on each `Suspense`, not on the boundary component beneath it: a title switch is a
 * page navigation for both callers of this component, which already remounts everything
 * here, but the key still matches the convention `live-title-facts.tsx`'s client variant
 * keys itself by at its own call site — belt and braces, at no real cost.
 *
 * ── `userId` is a prop, and it goes no further than this file ────────────────────────
 *
 * The three reads are cached since issue #225, and every cache key in this application
 * carries an account, so the account has to reach them. Both callers are pages that have
 * already resolved one through `requireUserId`, so it arrives as a prop rather than being
 * resolved again — three times — here.
 *
 * It stops at the three async Server Components below. What crosses to the browser is the
 * resolved `Outcome` and nothing else, exactly as before: `*FactSection` is a client
 * component and takes no account, because a *Try again* is a Server Action and resolves
 * its own.
 */
export function LiveTitleFactsStreamed({
  userId,
  kind,
  tmdbId,
}: {
  userId: UserId;
  kind: TitleKind;
  tmdbId: number;
}) {
  const forTitle = `${kind}:${tmdbId}`;

  return (
    <>
      <Suspense key={`synopsis:${forTitle}`} fallback={<LiveFactPlaceholder heading="Synopsis" />}>
        <SynopsisBoundary userId={userId} kind={kind} tmdbId={tmdbId} />
      </Suspense>

      <Suspense
        key={`providers:${forTitle}`}
        fallback={<LiveFactPlaceholder heading="Watch providers" />}
      >
        <WatchProvidersBoundary userId={userId} kind={kind} tmdbId={tmdbId} />
      </Suspense>
    </>
  );
}

/** One title, and the account whose cache entry of it this is. The three boundaries take
 *  the same three things, so they say so once. */
/**
 * Cast, streamed on its own — the third of the three live facts, split out of the group.
 *
 * ── Why it is a second component rather than a third child of the first ─────────────
 *
 * Title detail puts cast **last**, after the rating, and the other two immediately under
 * the hero. They cannot be one node any more: a caller handing `ProgrammeNoteContent` a
 * single `liveFacts` could only place all three together.
 *
 * Nothing else changes. It is the same read, the same `Suspense`, the same independent
 * stream — the group was never a fetching unit, only an ordering one, and this is that
 * ordering being decided by the screen instead of by the group.
 */
export function CastStreamed({
  userId,
  kind,
  tmdbId,
}: {
  userId: UserId;
  kind: TitleKind;
  tmdbId: number;
}) {
  return (
    <Suspense
      key={`cast-crew:${kind}:${tmdbId}`}
      fallback={<LiveFactPlaceholder heading="Cast & crew" />}
    >
      <CastAndCrewBoundary userId={userId} kind={kind} tmdbId={tmdbId} />
    </Suspense>
  );
}

interface BoundaryProps {
  readonly userId: UserId;
  readonly kind: TitleKind;
  readonly tmdbId: number;
}

async function SynopsisBoundary({ userId, kind, tmdbId }: BoundaryProps) {
  const initial = await readSynopsis(userId, kind, tmdbId);
  return <SynopsisFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}

async function WatchProvidersBoundary({ userId, kind, tmdbId }: BoundaryProps) {
  const initial = await readWatchProviders(userId, kind, tmdbId);
  return <WatchProvidersFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}

async function CastAndCrewBoundary({ userId, kind, tmdbId }: BoundaryProps) {
  const initial = await readCastAndCrew(userId, kind, tmdbId);
  return <CastAndCrewFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}
