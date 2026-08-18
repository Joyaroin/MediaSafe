"use server";

import { getTitleDetail, type TitleDetailRow } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { requireUserId } from "@/lib/session";
import {
  titleCastAndCrew,
  titleSynopsis,
  titleWatchProviders,
  type CastAndCrew,
} from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";

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
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reference: string | null };

/** The mirrored half of title detail — the desktop pane's read, `db/access.ts`'s own. */
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
 */
export async function titleSynopsisAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<string | null>> {
  await requireUserId();

  try {
    return { ok: true, value: await titleSynopsis(kind, tmdbId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "title-synopsis" }) };
  }
}

export async function titleCastAndCrewAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<CastAndCrew>> {
  await requireUserId();

  try {
    return { ok: true, value: await titleCastAndCrew(kind, tmdbId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "title-cast-crew" }) };
  }
}

export async function titleWatchProvidersAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<Outcome<readonly WatchProvider[]>> {
  await requireUserId();

  try {
    return { ok: true, value: await titleWatchProviders(kind, tmdbId) };
  } catch (error) {
    return {
      ok: false,
      reference: referenceFor(error, { surface: "title-watch-providers" }),
    };
  }
}
