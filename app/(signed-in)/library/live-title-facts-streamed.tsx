import { Suspense } from "react";

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
 */
export function LiveTitleFactsStreamed({
  kind,
  tmdbId,
}: {
  kind: TitleKind;
  tmdbId: number;
}) {
  const forTitle = `${kind}:${tmdbId}`;

  return (
    <>
      <Suspense key={`synopsis:${forTitle}`} fallback={<LiveFactPlaceholder heading="Synopsis" />}>
        <SynopsisBoundary kind={kind} tmdbId={tmdbId} />
      </Suspense>

      <Suspense
        key={`providers:${forTitle}`}
        fallback={<LiveFactPlaceholder heading="Watch providers" />}
      >
        <WatchProvidersBoundary kind={kind} tmdbId={tmdbId} />
      </Suspense>

      <Suspense key={`cast-crew:${forTitle}`} fallback={<LiveFactPlaceholder heading="Cast & crew" />}>
        <CastAndCrewBoundary kind={kind} tmdbId={tmdbId} />
      </Suspense>
    </>
  );
}

async function SynopsisBoundary({ kind, tmdbId }: { kind: TitleKind; tmdbId: number }) {
  const initial = await readSynopsis(kind, tmdbId);
  return <SynopsisFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}

async function WatchProvidersBoundary({ kind, tmdbId }: { kind: TitleKind; tmdbId: number }) {
  const initial = await readWatchProviders(kind, tmdbId);
  return <WatchProvidersFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}

async function CastAndCrewBoundary({ kind, tmdbId }: { kind: TitleKind; tmdbId: number }) {
  const initial = await readCastAndCrew(kind, tmdbId);
  return <CastAndCrewFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}
