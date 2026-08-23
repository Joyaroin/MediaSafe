import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { invalidateBorrowedFactsFor } from "@/cache/borrowed-facts";
import { invalidateForOtherAccounts } from "@/cache/tags";
import { accountsHoldingTitles } from "@/db/access";
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
 *
 * ── It still has to name accounts, once, at the end — issue #219 ─────────────────────
 *
 * The library's read is cached, keyed and tagged per account (`cache/tags.ts`), and a
 * refreshed mirror changes three columns that grid prints: `title.name`, `release_year`
 * and `poster_path`. So the one write in this application that belongs to nobody is also
 * the one write that can leave *somebody's* cached library disagreeing with the database,
 * and it is the only write whose accounts are not simply the caller's own.
 *
 * `accountsHoldingTitles` resolves them from the titles the run actually refreshed —
 * never from the candidates, because a title that failed or was quarantined changed
 * nothing and busting for it would throw away a correct entry. `route.ts` does this and
 * not `run-sweep.ts`, for the reason that file's own docblock gives: `run-sweep.ts` is
 * the part that is tested against real Postgres without Next.js around it, and
 * `revalidateTag` is Next.js. Resolving who is affected is a query; busting is a
 * framework call; they belong on opposite sides of that line.
 *
 * `invalidateForOtherAccounts`, not `invalidateFor`: `updateTag` throws outside a Server
 * Action, and nobody here is reading their own write — the reader whose poster changed is
 * asleep, and stale-while-revalidate is the honest treatment for that. No `writer` is
 * passed because this run has none; the three add paths, which make the same shared-mirror
 * write from inside an action, do pass one.
 *
 * ── And it has to name the titles, too — issue #225 ──────────────────────────────────
 *
 * The account list above is the whole answer for the library grid and none of it for the
 * unowned title page, whose mirrored read this run also rewrites and whose readers are
 * precisely the accounts that do not hold the title. That page's read is tagged by the
 * title, so the second call below busts by catalogue key and reaches every account at
 * once. The two calls are not two spellings of one bust: they name different populations
 * for different reads, and the sweep is the write that makes the difference visible.
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (unauthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await runNightlySweep(titleMirror, findByExternalId);

  invalidateForOtherAccounts(
    "refreshTitleMirror",
    await accountsHoldingTitles(outcome.refreshed.map(({ id }) => id)),
  );

  /**
   * And the borrowed facts of the titles themselves — issue #225, and the bust the call
   * above cannot stand in for.
   *
   * `accountsHoldingTitles` answers *whose library grid prints this title*. The unowned
   * title page's mirrored read is the other side of exactly that question: its readers are
   * the accounts that do **not** hold the title, and there is no query that enumerates
   * them, because the answer is *anyone who opens the page*. So the borrowed facts are
   * tagged by the title instead, and one call reaches every account's entry for it
   * (`cache/borrowed-facts.ts`).
   *
   * This is the acceptance criterion *a title refreshed by the nightly sweep is visible on
   * the next read, without waiting for a window* — the window is six hours, and it is a
   * ceiling rather than the mechanism.
   *
   * **Both ids of a repoint.** `outcome.refreshed` carries the candidate, whose `tmdbId`
   * is the one that vanished — the key every stale entry is stored under, and so the one
   * that has to be expired. The survivor is `repointed`'s `toTmdbId`, and it is busted too
   * rather than assumed cold: the page for that id is reachable and may well have been
   * read before tonight, under a `title` row that has just been rewritten to be this show.
   */
  invalidateBorrowedFactsFor([
    ...outcome.refreshed,
    ...outcome.repointed.map(({ candidate, toTmdbId }) => ({
      kind: candidate.kind,
      tmdbId: toTmdbId,
    })),
  ]);

  /**
   * A body, not a page: nothing renders this, and `SPEC.md` §6 is explicit that no
   * surface anywhere shows a refresh status. It exists only for the Vercel cron log —
   * `docs/deployment.md`'s equivalent of the press-check line other routes print.
   */
  return NextResponse.json({
    candidates: outcome.candidates,
    refreshed: outcome.refreshed.length,
    skipped: outcome.failures.length,
    repointed: outcome.repointed.length,
    quarantined: outcome.quarantined.length,
  });
}
