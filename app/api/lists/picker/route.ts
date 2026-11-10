import { NextResponse } from "next/server";

import { cachedLists } from "@/cache/tags";
import { referenceFor } from "@/errors/reference";
import { signedInUserId } from "@/lib/session";

import type { ListsForPickerOutcome } from "@/app/(signed-in)/lists/lists-for-picker";

/**
 * The list pickers' read, as a signed-in `GET` instead of a Server Action (issue #481,
 * following issue #480's `/api/search`) — the add-to-list control on title detail and the
 * bulk selection bar both open this picker while a watch mark may still be saving, and
 * `listsForPickerAction` queued behind it: Next dispatches Server Actions one at a time.
 * A `GET` has no such queue.
 *
 * ── The user id ──────────────────────────────────────────────────────────────────────
 *
 * `signedInUserId()` rather than `requireUserId()`, for the reason `app/api/search/
 * route.ts` gives: a redirect response from inside a `fetch` is not a navigation, so the
 * `401` answered below is what `app/read-route.ts` notices, and it is that module — not
 * this route — which sends the reader to `/sign-in`.
 *
 * ── The read, and its one failure ───────────────────────────────────────────────────
 *
 * `cachedLists` is the same choke point `listsForPickerAction` read through and the Lists
 * page and the phone rail still do — one read behind all three, so a list created from
 * the picker shows up everywhere else on the next render. A thrown read is reported here,
 * with `referenceFor()`, and answered `200` with the reference rather than left to reach
 * Next's own 500: this route has no inline failure region of its own to render into, only
 * a status code and a body `add-to-list-control.tsx` and `selection-action-bar.tsx`
 * already know how to draw (`AGENTS.md`'s *report and rethrow* exception for a Route
 * Handler answering a read).
 */
export async function GET(): Promise<NextResponse> {
  const userId = await signedInUserId();
  if (userId === null) {
    return NextResponse.json({ signedOut: true }, { status: 401 });
  }

  try {
    const outcome: ListsForPickerOutcome = { ok: true, lists: await cachedLists(userId) };
    return NextResponse.json(outcome);
  } catch (error) {
    const outcome: ListsForPickerOutcome = {
      ok: false,
      reference: referenceFor(error, { surface: "lists" }),
    };
    return NextResponse.json(outcome);
  }
}
