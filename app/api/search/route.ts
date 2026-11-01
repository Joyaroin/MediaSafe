import { NextRequest, NextResponse } from "next/server";

import { libraryCatalogueKeys, type UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { signedInUserId } from "@/lib/session";
import { searchCatalogueOfKind } from "@/tmdb/catalogue";
import { catalogueKeyOf, type TitleKind } from "@/tmdb/mirror";

import type { BothKinds, KindOutcome } from "@/app/(signed-in)/search/search-groups";

/**
 * Search's read, as a signed-in `GET` instead of a Server Action (issue #480).
 *
 * `searchCatalogueAction` queued behind whatever Server Action a watch mark was already
 * saving — Next dispatches them one at a time — so typing into Search while a mark was in
 * flight waited on it. A `GET` has no such queue, and `app/read-route.ts` is the client
 * half: it calls here with an `AbortController`, so a superseded keystroke cancels its own
 * request rather than racing it to the screen.
 *
 * ── The user id ──────────────────────────────────────────────────────────────────────
 *
 * `signedInUserId()` rather than `requireUserId()`: a redirect response from inside a
 * `fetch` is not a navigation, so the 401 answered below is what `app/read-route.ts`
 * notices instead, and it is that module which sends the reader to `/sign-in` — the auth
 * row of the error discipline is full-page, and this route is not the page.
 *
 * ── Each kind still answers for itself ───────────────────────────────────────────────
 *
 * Unchanged from `searchCatalogueAction`: one kind's failure never fails the other, and a
 * failed kind comes back as `{ ok: false, reference }` with its own reference rather than
 * as a kind with no matches — `AGENTS.md`'s *no `catch` returns `[]`*, read for a kind
 * instead of a whole response. `searchOneKind`'s `catch` is the rule's second permitted
 * case: the failure is reported here, with `referenceFor()`, and this handler answers
 * `200` with the reference rather than letting the throw reach Next's own 500 — the same
 * reasoning `searchCatalogueAction`'s docblock gave for why that action caught rather than
 * threw, now true of a Route Handler for an identical reason: a technical response here
 * has no inline failure region to render into on the other end, only a status code and a
 * body `app/(signed-in)/search/search-surface.tsx` already knows how to draw.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await signedInUserId();
  if (userId === null) {
    return NextResponse.json({ signedOut: true }, { status: 401 });
  }

  const trimmed = (request.nextUrl.searchParams.get("q") ?? "").trim();

  // A blank query is not a search, exactly as `searchCatalogueAction` treated it: the
  // honest answer is that nothing was asked, not that nothing matched.
  if (!trimmed) {
    const empty: BothKinds = {
      show: { ok: true, results: [] },
      film: { ok: true, results: [] },
    };
    return NextResponse.json(empty);
  }

  const [show, film] = await Promise.all([
    searchOneKind(userId, "show", trimmed),
    searchOneKind(userId, "film", trimmed),
  ]);

  const outcome: BothKinds = { show, film };
  return NextResponse.json(outcome);
}

async function searchOneKind(
  userId: UserId,
  kind: TitleKind,
  trimmed: string,
): Promise<KindOutcome> {
  try {
    const results = await searchCatalogueOfKind(kind, trimmed);
    const held = await libraryCatalogueKeys(userId, results);

    return {
      ok: true,
      results: results.map((result) => ({
        ...result,
        inLibrary: held.has(catalogueKeyOf(result)),
      })),
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search", kind }) };
  }
}
