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
 * The unowned-title page's title facts — a **Server Component**, issue #218's answer for
 * the surfaces that are real page renders. `live-title-facts.tsx`'s own top docblock is the
 * fuller account; this file is the half of it that streams.
 *
 * This component draws the synopsis and the watch providers as a pair, which is what that
 * page wants and what title detail no longer does: title detail takes `SynopsisStreamed`,
 * `WatchProvidersStreamed` and `CastStreamed` one at a time, because its three sections
 * land in three different places. All four exports share the same boundary components at
 * the foot of this file.
 *
 * Each read gets its own `<Suspense>`, wrapping a tiny async Server Component that awaits
 * exactly one field and hands the resolved `Outcome<T>` to the matching `*FactSection`
 * client component (`live-title-facts.tsx`). That split is what lets the page shell —
 * poster, title, episodes, everything `getTitleDetail`/`getUnownedTitleDetail` already
 * answered — ship the moment the mirrored read is done, with each live section streaming in
 * independently as its own TMDB call resolves, instead of the whole page waiting on the
 * slowest of them.
 *
 * `key` on each `Suspense`, not on the boundary component beneath it: a title switch is a
 * page navigation for both callers of this component, which already remounts everything
 * here, but the key still matches the convention `live-title-facts.tsx`'s client variant
 * keys itself by at its own call site — belt and braces, at no real cost.
 *
 * ── `userId` is a prop, and it goes no further than this file ────────────────────────
 *
 * The reads are cached since issue #225, and every cache key in this application carries
 * an account, so the account has to reach them. Every caller is a page that has already
 * resolved one through `requireUserId`, so it arrives as a prop rather than being resolved
 * again here, once per section.
 *
 * It stops at the async Server Components below. What crosses to the browser is the
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

/**
 * The synopsis alone, streamed **into the hero's card** — title detail's half of what the
 * component above still does whole for the unowned-title page.
 *
 * ── Why the pair came apart ─────────────────────────────────────────────────────────
 *
 * The synopsis sits inside `TitleHero`'s card now, under the poster row, and the watch
 * providers keep a card of their own below it. One node holding both could only place
 * them together — the identical argument `CastStreamed` was split out on, one section
 * later. The group was never a fetching unit: each read had its own `Suspense` before this
 * and has its own now, so nothing about the streaming changed, only who decides where each
 * resolved section lands.
 *
 * `nested` reaches `SynopsisFactSection` as a plain boolean, which is all that may cross
 * this boundary — the section builds its own `refetch` closure on the client side, for
 * `live-title-facts.tsx`'s stated reason.
 *
 * The unowned-title page keeps `LiveTitleFactsStreamed` above and both cards: that screen
 * has no hero card for a synopsis to sit inside.
 */
export function SynopsisStreamed({
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
      key={`synopsis:${kind}:${tmdbId}`}
      fallback={<LiveFactPlaceholder heading="Synopsis" nested />}
    >
      <SynopsisBoundary userId={userId} kind={kind} tmdbId={tmdbId} nested />
    </Suspense>
  );
}

/** The watch providers alone — the other half of the split above, in a card of its own
 *  below the hero. */
export function WatchProvidersStreamed({
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
      key={`providers:${kind}:${tmdbId}`}
      fallback={<LiveFactPlaceholder heading="Watch providers" />}
    >
      <WatchProvidersBoundary userId={userId} kind={kind} tmdbId={tmdbId} />
    </Suspense>
  );
}

/**
 * Cast, streamed on its own — the first of the three to be split out of the group, and the
 * one that started the argument the other two eventually followed.
 *
 * ── Why it is its own component rather than a third child of the group ──────────────
 *
 * Title detail puts cast **last**, below the episode list, and it cannot be one node with
 * sections that go elsewhere: a caller handing `ProgrammeNoteContent` a single `liveFacts`
 * could only place all three together. The synopsis and the providers came apart the same
 * way one section later, when the synopsis moved into the hero's card.
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

async function SynopsisBoundary({
  userId,
  kind,
  tmdbId,
  nested = false,
}: BoundaryProps & { readonly nested?: boolean }) {
  const initial = await readSynopsis(userId, kind, tmdbId);
  return <SynopsisFactSection kind={kind} tmdbId={tmdbId} initial={initial} nested={nested} />;
}

async function WatchProvidersBoundary({ userId, kind, tmdbId }: BoundaryProps) {
  const initial = await readWatchProviders(userId, kind, tmdbId);
  return <WatchProvidersFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}

async function CastAndCrewBoundary({ userId, kind, tmdbId }: BoundaryProps) {
  const initial = await readCastAndCrew(userId, kind, tmdbId);
  return <CastAndCrewFactSection kind={kind} tmdbId={tmdbId} initial={initial} />;
}
