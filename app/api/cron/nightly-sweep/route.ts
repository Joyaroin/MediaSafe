import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { findByExternalId, titleMirror } from "@/tmdb/catalogue";

import { unauthorized } from "./authorize";
import { runNightlySweep } from "./run-sweep";

/**
 * The nightly metadata sweep (ADR-0001, issue #115) — the first thing in this application
 * that runs with nobody watching. Refreshes up to 200 titles a night, in-production shows
 * whose next air date has passed first, then whatever has gone longest unrefreshed, and
 * writes #114's external id as it goes. `run-sweep.ts` carries the run itself; this file
 * is the HTTP wrapper around it and nothing else.
 *
 * ── Un-sessioned, not unauthenticated ────────────────────────────────────────────────
 *
 * **Vercel's cron sends no session cookie.** Behind `proxy.ts`'s matcher a request with
 * none is redirected to sign-in, and the refresh would silently never run — the exact
 * failure this ticket exists to prevent. So this route is a **third named entry** in
 * `proxy.ts`'s matcher and in `tests/route-manifest.test.ts`'s `EXEMPT` list, added rather
 * than folded into the matcher's regex, per issue #43: an exemption is a line in a pull
 * request with a name on it, not two characters appended where nobody looks.
 *
 * That does not make this route unauthenticated. It checks a bearer `CRON_SECRET` itself,
 * below, and rejects anything without it — Vercel's own documented pattern for securing a
 * cron endpoint, and the value Vercel sends automatically as the `Authorization` header
 * when `CRON_SECRET` is set in the project's environment variables. Un-sessioned and
 * unauthenticated are different claims, and only the first is true here.
 *
 * ── No user id, no session, and that is coherent rather than an oversight ─────────────
 *
 * `title` and `episode` are global and unowned (ADR-0001) — the mirror is refreshed for
 * everybody at once, so a sweep acting for nobody in particular is the correct shape, not
 * a corner this route cuts. It takes no user id and never calls `lib/session.ts`.
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await runNightlySweep(titleMirror, findByExternalId);

  /**
   * A body, not a page: nothing renders this, and `SPEC.md` §6 is explicit that no
   * surface anywhere shows a refresh status. It exists only for the Vercel cron log —
   * `docs/deployment.md`'s equivalent of the press-check line other routes print.
   */
  return NextResponse.json({
    candidates: outcome.candidates,
    refreshed: outcome.refreshed,
    skipped: outcome.failures.length,
    repointed: outcome.repointed.length,
    quarantined: outcome.quarantined.length,
  });
}
