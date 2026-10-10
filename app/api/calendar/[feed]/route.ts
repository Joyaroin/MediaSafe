import type { NextRequest } from "next/server";

import { calendarFeedOwner, listCalendarFeed } from "@/db/access";
import {
  calendarEvents,
  calendarFeedTokenFrom,
  publicOrigin,
  serializeCalendar,
} from "@/lib/calendar-feed";

/**
 * The reader's calendar feed — issue #366. `GET /api/calendar/<token>.ics`.
 *
 * ── Un-sessioned, not unauthenticated ────────────────────────────────────────────────
 *
 * A calendar app subscribing to a URL sends no cookie and cannot sign in, so this is the
 * fourth named exemption in `proxy.ts`'s matcher and in `tests/route-manifest.test.ts`'s
 * `EXEMPT`, beside the nightly sweep. The token in the path is the credential: 256 random
 * bits, minted by the server, held by one account, and replaced from Settings — at which
 * point this answers 404 for the old URL.
 *
 * ── 404 for every way of not being a feed ────────────────────────────────────────────
 *
 * A malformed segment, a replaced token and one that never existed all get the same plain
 * 404. Distinguishing them would tell someone guessing which guesses were nearly right.
 *
 * ── No `try` ─────────────────────────────────────────────────────────────────────────
 *
 * A failed read throws and Next answers 500. That matters more here than on a page: a
 * calendar app that receives an empty calendar deletes every event it had, while one that
 * receives an error keeps them and retries. An empty feed must only ever mean *nothing is
 * coming*.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ feed: string }> },
): Promise<Response> {
  const { feed } = await context.params;
  const token = calendarFeedTokenFrom(feed);
  const owner = token === null ? null : await calendarFeedOwner(token);

  if (owner === null) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const origin = publicOrigin(process.env.BETTER_AUTH_URL, request.headers);
  const body = serializeCalendar(calendarEvents(await listCalendarFeed(owner), origin), new Date());

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mediasafe.ics"',
      // The URL is a secret; nothing between here and the calendar app should keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
