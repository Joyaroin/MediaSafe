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

/**
 * The desktop pane's and the Up next sheet's one read for opening a title — issue #218.
 * It used to hand back only the mirrored half (`TitleDetailRow`), leaving `LiveTitleFacts`
 * to fire three more client round trips once it mounted. Now it fetches the three live
 * facts too, concurrently with each other, on the same server round trip that already
 * fetches the mirrored half — so opening a title costs one trip from the browser, not four,
 * and the three live reads never wait on a mount to begin.
 *
 * The live facts need `detail.kind`/`detail.tmdbId` to ask TMDB anything, so they cannot
 * start before `getTitleDetail` resolves — the two reads are sequential, not concurrent
 * with each other, only the three live reads are concurrent with one another
 * (`readLiveFacts`, in `live-facts.ts`).
 */
export interface TitleDetailWithLiveFacts {
  readonly detail: TitleDetailRow;
  readonly liveFacts: LiveFacts;
}

export async function titleDetailAction(
  libraryEntryId: string,
): Promise<Outcome<TitleDetailWithLiveFacts>> {
  const userId = await requireUserId();

  try {
    const detail = await getTitleDetail(userId, libraryEntryId);
    const liveFacts = await readLiveFacts(detail.kind, detail.tmdbId);
    return { ok: true, value: { detail, liveFacts } };
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
 * Issue #218 moved the *first* read of these three onto the server, alongside the page or
 * pane's own detail read (`readLiveFacts`, called from this file's `titleDetailAction` and
 * from the two title-detail page routes directly). These three actions remain for what is
 * left: a reader's own *Try again* on a section that failed, which is a client-initiated
 * request by nature — there is no page render or pane open for it to ride along with.
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
