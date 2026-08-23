import { cachedAccountStats } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { EmptyStats } from "./empty-stats";
import { StatsHeading } from "./stats-heading";
import { StatsSurface } from "./stats-surface";
import { NavTransition } from "../nav-transition";

/**
 * Stats — the phone's fourth tab and the desktop sidebar's sixth destination, issue #227.
 *
 * **A destination rather than a page inside Settings**, which is #215's user story 51 in as
 * many words: *somewhere I go rather than something I find*. That is why the tab reshuffle
 * happens in this ticket and not in #223 — a tab is only worth adding once there is a page
 * behind it, and this is that page.
 *
 * ── One read, and one branch ─────────────────────────────────────────────────────────
 *
 * `cachedAccountStats` is the whole of the page's data, cached and tagged through
 * `cache/tags.ts` since every figure on it goes stale on the writes the library's does
 * (issue #219's machinery, second caller). Everything it returns is computed in SQL beside
 * the derived views, so *released* and *above season zero* are answered by `db/views.ts` here
 * exactly as they are on the grid.
 *
 * Past that there is one branch and it is the important one:
 *
 *  - **`titles` is zero** → the library is genuinely empty, and `EmptyStats` says so in a
 *    sentence. Not a grid of zeroes: every figure really is `0`, and printing them would be
 *    a page that looks like it is reporting when there is nothing to report.
 *  - **The read failed** → `accountStats` throws, this component never renders, and
 *    `error.tsx` draws the read-failure treatment in its place.
 *
 * There is no third path, and specifically no `try` here or in `db/access.ts` that could turn
 * the second into the first. On a page made entirely of numbers that collapse is unusually
 * easy to make and unusually hard to see: every failure has a plausible-looking zero waiting
 * for it. `AGENTS.md` opens on why `tvtracker` is the cautionary tale.
 */

/**
 * Never prerendered, for the reason `/library`, `/lists` and `/settings` all carry this
 * line: reading the session reads cookies, which makes the route dynamic only *after* the
 * attempt — and without it `next build` starts a prerender, calls `requireUserId()`, and
 * resolves the pool against whatever `DATABASE_URL` the build environment has.
 */
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const userId = await requireUserId();

  /**
   * Unguarded, deliberately, and still unguarded through the cache: `unstable_cache` stores
   * a resolved value and lets a rejection through untouched, so there is no cache state in
   * which a database that is down comes back as an account that has watched nothing.
   */
  const stats = await cachedAccountStats(userId);

  return (
    <NavTransition>
      <main className="flex w-full flex-1 flex-col">
        <StatsHeading />

        {stats.titles === 0 ? <EmptyStats /> : <StatsSurface stats={stats} />}
      </main>
    </NavTransition>
  );
}
