"use server";

import {
  abandonTitle,
  getTitleDetail,
  unabandonTitle,
  type LibraryState,
  type TitleDetailRow,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import {
  readCastAndCrew,
  readLiveFacts,
  readSynopsis,
  readWatchProviders,
  type LiveFacts,
  type Outcome,
} from "./live-facts";

export type { Outcome } from "./live-facts";

/**
 * Title detail's four reads, each a Server Action rather than a page-render throw — the
 * shape `app/(signed-in)/search/actions.ts` already argues for and this reuses rather
 * than re-derives: **the desktop pane never navigates**, so there is no route-level
 * `error.tsx` for it to throw into the way
 * `app/(signed-in)/library/[entryId]/page.tsx` (the phone route) has. React also strips a
 * thrown Server Action's error before it crosses to the browser, so catching here is what
 * lets Sentry see the real exception and the reader see a reference id for it.
 *
 * The phone route does not call these. It calls `getTitleDetail` directly and lets a
 * failure throw into its own boundary, for the same reason `app/(signed-in)/library/page.tsx`
 * does for the grid.
 */

/** The mirrored half of title detail — the desktop pane's and the Up next sheet's read.
 *  Unchanged by issue #218: it stays the fast, DB-only read it always was, so the panel
 *  those two surfaces show still appears the moment this resolves, not gated behind
 *  whatever the three live facts below are doing (`titleLiveFactsAction`'s own docblock —
 *  and `live-title-facts.tsx`'s top one — carry why the two stay separate reads). */
export async function titleDetailAction(
  libraryEntryId: string,
): Promise<Outcome<TitleDetailRow>> {
  const userId = await requireUserId();

  try {
    return { ok: true, value: await getTitleDetail(userId, libraryEntryId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "title-detail" }) };
  }
}

/**
 * The three live-only sections below are **three actions, not one**, so that a synopsis
 * TMDB answers can render while credits TMDB is failing on the same title cannot, and the
 * reverse — `docs/design/v1-surfaces.md` §7's *fails inline, in its own section* only
 * holds if the sections do not share a failure. Every one of the three still requires a
 * session: `title` and `episode` are unowned (ADR-0001), but a Server Action is a POST
 * endpoint anyone can call with any arguments, and `SPEC.md` §3's *no unauthenticated
 * route may ever be added* does not carve out an exception for one that happens to touch
 * no owned row.
 *
 * They remain for what issue #218 left them for: a reader's own *Try again* on a section
 * that failed, after `titleLiveFactsAction` or `live-title-facts-streamed.tsx`'s own
 * `readSynopsis`/`readCastAndCrew`/`readWatchProviders` already answered the first read.
 */
export async function titleSynopsisAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  await requireUserId();
  return readSynopsis(kind, tmdbId);
}

export async function titleCastAndCrewAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<CastAndCrew>> {
  await requireUserId();
  return readCastAndCrew(kind, tmdbId);
}

export async function titleWatchProvidersAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  await requireUserId();
  return readWatchProviders(kind, tmdbId);
}

/**
 * The desktop pane's and the Up next sheet's one combined read for the three live
 * sections — issue #218. Neither surface navigates, so neither has a page render to
 * stream the three behind (`live-title-facts-streamed.tsx` is what the two surfaces that
 * do have one use instead). This is the next best thing: one round trip for all three,
 * computed concurrently on the server (`readLiveFacts`, in `live-facts.ts`), fired once
 * when `LiveTitleFactsClientFetch` mounts — not the three separate round trips that used
 * to fire from three separate mounts before this issue, and not folded into
 * `titleDetailAction` either, because that would gate the whole panel behind TMDB instead
 * of just the three sections that are actually TMDB's to answer.
 *
 * Never throws — `readLiveFacts` catches each of the three fields on its own account — so
 * there is no `Outcome` wrapping the whole call the way `titleDetailAction`'s DB read
 * needs one.
 */
export async function titleLiveFactsAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<LiveFacts> {
  await requireUserId();
  return readLiveFacts(kind, tmdbId);
}

/**
 * The abandon control's two writes (issue #87) — `AbandonControl` calls whichever one its
 * own current state says is next, and both report the same shape their sibling actions
 * above already established. `abandonAction`'s result is always `"abandoned"`;
 * `db/access.ts`'s `abandonTitle` needs no state back because that is the entire point of
 * `abandoned_at` outranking every derived rule. `unabandonAction` has no such certainty —
 * its outcome is read back from `unabandonTitle`, which reads it from the view rather
 * than guessing, so this file adds no second copy of the five-state rule either.
 */
export type AbandonOutcome =
  | { readonly ok: true; readonly state: LibraryState }
  | { readonly ok: false; readonly reference: string | null };

export async function abandonAction(libraryEntryId: string): Promise<AbandonOutcome> {
  const userId = await requireUserId();

  try {
    await abandonTitle(userId, libraryEntryId);
    return { ok: true, state: "abandoned" };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "abandon" }) };
  }
}

export async function unabandonAction(libraryEntryId: string): Promise<AbandonOutcome> {
  const userId = await requireUserId();

  try {
    const outcome = await unabandonTitle(userId, libraryEntryId);
    return { ok: true, state: outcome.state };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "abandon" }) };
  }
}
