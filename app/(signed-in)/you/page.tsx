import { cachedAccountFigures, cachedYouListCards, cachedYouRails } from "@/cache/tags";
import { requireAvatarUrl, requireDisplayName, requireUserId } from "@/lib/session";
import { EmptyYou } from "./empty-you";
import { YouHeading } from "./you-heading";
import { YouHero } from "./you-hero";
import { YouSurface } from "./you-surface";
import { NavTransition } from "../nav-transition";

/**
 * You — the reader, and the six figures that describe a watching life (issue #247).
 *
 * **The phone's fourth tab and the desktop sidebar's sixth entry, since issue #249.** They
 * pointed at `/stats` when #247 built this page — reachable by URL and not yet by the bar,
 * because repointing them while the page they replace still existed beside this one would
 * have been two destinations answering one question. #249 deleted that page and moved both
 * `href`s, and it moved exactly those: the `NavTransition` wrapper below was already here
 * for that reason.
 *
 * ── The hero reads the session; the figures read the database ────────────────────────
 *
 * Two different sources, and the difference is why a failed read still renders a page with
 * a name on it in every case but the boundary's. `requireDisplayName` and
 * `requireAvatarUrl` come off the session Better Auth already resolved for this request —
 * no query, and nothing that can be down separately from the app itself.
 *
 * The name is read on the server rather than through `DisplayNameCell`, which the masthead
 * and the sidebar both use. That component exists because those two live in a **layout**,
 * which the client Router Cache keeps across navigations, so a name saved in Settings had
 * no way of reaching them. This is a page segment: it is refetched on every navigation to
 * it, so the server's own read is already the current one.
 *
 * ── One read, and one branch ─────────────────────────────────────────────────────────
 *
 * `cachedAccountFigures` is the whole of the page's figures, cached and tagged through
 * `cache/tags.ts` under the `you` fact. That fact was called `stats` and was shared with the
 * Stats page's own read until #249; the rename is the only thing that changed, because the
 * writes that make these figures wrong were never per-read.
 *
 * Past that there is one branch and it is the important one:
 *
 *  - **`titles` is zero** → the library is genuinely empty, and `EmptyYou` says so in a
 *    sentence. Not a grid of zeroes: every figure really is `0`, and printing them would
 *    be a page that looks like it is reporting when there is nothing to report.
 *  - **The read failed** → `accountFigures` throws, this component never renders, and
 *    `error.tsx` draws the read-failure treatment with a reference id in its place.
 *
 * There is no third path, and specifically no `try` here or in `db/access.ts` that could
 * turn the second into the first. On a page made entirely of numbers that collapse is
 * unusually easy to make and unusually hard to see: every failure has a plausible-looking
 * zero waiting for it. `AGENTS.md` opens on why `tvtracker` is the cautionary tale.
 */

/**
 * Never prerendered, for the reason `/library`, `/lists` and `/settings` all carry this
 * line: reading the session reads cookies, which makes the route dynamic only
 * *after* the attempt — and without it `next build` starts a prerender, calls
 * `requireUserId()`, and resolves the pool against whatever `DATABASE_URL` the build
 * environment has.
 */
export const dynamic = "force-dynamic";

export default async function YouPage() {
  const userId = await requireUserId();
  const displayName = await requireDisplayName();
  const avatarUrl = await requireAvatarUrl();

  /**
   * Unguarded, deliberately, and still unguarded through the cache: `unstable_cache`
   * stores a resolved value and lets a rejection through untouched, so there is no cache
   * state in which a database that is down comes back as an account that has watched
   * nothing.
   *
   * Three independent reads, overlapped — `listUpNextRails`'s own reason for its two
   * concurrent statements: none takes another's rows, so there is nothing to serialise
   * them for. A failure in any one of the three still throws past this component into
   * `error.tsx`, `Promise.all` included: it rejects on the first rejection, exactly as a
   * single `await` would have.
   *
   * The lists rail and the shows/films rails are read whether or not the library is
   * empty — `figures.titles === 0` decides the six-figure branch below and nothing about
   * a list, which can hold titles the reader's library never has (*a list
   * holds anything in the catalogue, not only what you own*).
   */
  const [figures, lists, rails] = await Promise.all([
    cachedAccountFigures(userId),
    cachedYouListCards(userId),
    cachedYouRails(userId),
  ]);

  return (
    <NavTransition>
      <main className="flex w-full flex-1 flex-col">
        <YouHeading />
        <YouHero displayName={displayName} avatarUrl={avatarUrl} />

        {figures.titles === 0 ? (
          <EmptyYou />
        ) : (
          <YouSurface figures={figures} lists={lists} shows={rails.shows} films={rails.films} />
        )}
      </main>
    </NavTransition>
  );
}
