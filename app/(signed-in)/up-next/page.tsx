import { Suspense } from "react";

import {
  cachedUpcomingEpisodes,
  cachedUpcomingFilms,
  cachedUpNextRails,
  cachedWatchlistFilms,
} from "@/cache/tags";
import { requireTimezone, requireUserId } from "@/lib/session";
import { LandingPager } from "./landing-pager";
import { UpcomingSurface } from "./upcoming-surface";
import { readerDay } from "./upcoming-grouping";
import { UpNextHeading } from "./up-next-heading";
import { UpNextWatching } from "./up-next-rails";
import { HoldOver } from "./hold-over";
import { SuggestionRail } from "./suggestion-rail";
import { NavTransition } from "../nav-transition";

/**
 * Up next — the surface both devices land on, and the one this app is opened to look at.
 *
 * Built at its own route by #101, made the landing screen by #102, made a desktop
 * destination by #136, given a desktop form of its own by #137 — three rails beside the
 * programme note — given the phone a form of its own by #138, and given the phone the form
 * it has now by **#250**: **two horizontal rails**, next episodes and films to watch.
 * #138's five vertical groups, their five expanded routes and the title sheet that had no
 * other caller are gone with that change; watchlist and abandoned stay reachable through
 * the library's status filters, which already carry all five states.
 *
 * ── Four reads and two renders, and the cost of that, stated ──────────────────────────
 *
 * `listUpNextRails` answers both devices — the phone's single next-episodes rail is the
 * desktop's three concatenated, from the same read, in the same order — and
 * `listWatchlistFilms` answers only the phone's second rail. **#251 added a third**,
 * `listUpcomingEpisodes`, and **#252 a fourth**, `listUpcomingFilms`; both answer only the
 * phone's second *page* and are paid for on a desktop load that will never draw either —
 * the same trade, two reads wider.
 *
 * The fourth is the one to be honest about, because it is the closest this page comes to
 * asking one question twice: `listWatchlistFilms` and `listUpcomingFilms` are the same
 * watchlist at two widths, one undated and complete, one dated and ahead of today. They
 * are not folded into one read that both surfaces filter, because the two rails want
 * different columns (a runtime against a release date) and different orders (A–Z against
 * soonest-first), and a single read wide enough for both would carry every column and be
 * sorted for neither. One extra query on a page that already makes three, against two
 * surfaces that stay independently correct. All run on every load because
 * **the server does not know the viewport** — #136 deleted the one `matchMedia` branch this
 * build ever had, deliberately. Since the UI overhaul both devices draw the same pager, so
 * no surface depends on the viewport at all.
 *
 * **Be precise about what that costs.** A desktop load pays for the films read without ever
 * rendering it, and both loads pay for the queue read inside `listUpNextRails` that only
 * the phone's checks use. The images are not part of that cost, since a browser does not
 * fetch a `loading="lazy"` poster inside a `display: none` subtree, so the waste is one
 * query and some DOM rather than bandwidth or TMDB requests. It is the same trade #137's
 * own docblock made for the rails on a phone load, paid the other way: two surfaces sharing
 * one route and reading everything either of them might render, rather than a second route
 * for one destination.
 *
 * #250 made that queue read wider — every *watching* entry rather than the first twelve,
 * because every card on the phone's rail carries a check — and `listUpNextRails` states
 * that cost in full. It is one query either way, and it replaced two reads
 * (`listWatchlist`, `listAbandoned`) that this page no longer makes.
 *
 * Since **#226** the cost is paid once rather than on every navigation: both reads go
 * through `cache/tags.ts`, keyed by this account and tagged `up-next`, and every write that
 * can change what either rail shows busts the tag inside its own action. What did not
 * change is which questions get asked — the desktop still pays for the rail it will not
 * render, on the first load of the day and after any write.
 *
 * Every read here is unguarded, and still is through the cache: `unstable_cache` stores a
 * resolved value only, so a rejection propagates out of it untouched and a failure in
 * either throws into `error.tsx`, which draws the read-failure treatment with a reference
 * id over this page's own heading. There is no `try` here, none in `cache/tags.ts` and none
 * in `db/access.ts`: **this is the surface `AGENTS.md`'s rule bites hardest on**, because
 * *nothing queued for tonight* is a plausible lie and a rail that is absent because the
 * database is down would read as a life well managed.
 *
 * ── Two empty states, and they are not one ────────────────────────────────────────────
 *
 * An **empty rail** is absent — no heading over nothing. **Every rail on one device empty**
 * is a different fact, answered by `up-next-rails.tsx` and `up-next-rails-surface.tsx`
 * respectively rather than here, since each of those is the component holding every rail
 * its own device shows. Both are reachable only from reads that succeeded.
 *
 * The two devices can honestly disagree here, and #250 gives them a new way to: the phone
 * asks *no next episode and no watchlist film*, the desktop asks *nothing watching and
 * nothing dated to come back*. A library whose only content is three unwatched films
 * answers the desktop's question yes — *you're caught up* — while the phone draws a films
 * rail. Both are true; they are not the same question. `up-next-nothing.tsx` is where the
 * two sentences are kept apart on purpose.
 */
export const dynamic = "force-dynamic";

export default async function UpNextPage() {
  const userId = await requireUserId();

  /**
   * Concurrent, not sequential. None of these takes any part of another's result, so
   * awaiting them one after another bought nothing and cost three extra round trips to
   * Neon in front of the first byte of this page — on a driver where a round trip is a
   * WebSocket message and not a local socket write.
   *
   * The last is not a read of this database at all: `requireTimezone()` takes the zone
   * off the session, which #251 needs before it can say what *Today* means and #252 needs
   * before it can say how many days away *the 26th* is. It joins the four here rather than
   * being awaited beside them for the same reason they are together — it takes nothing
   * from them, and nothing takes anything from it.
   *
   * `Promise.all` rejects on the first rejection, which is the behaviour this page's
   * error discipline already asks for: any one of the five failing throws into
   * `error.tsx` exactly as it did when they ran in series. Nothing here catches, and the
   * unguarded reads above the `AGENTS.md` rule protects are still unguarded.
   */
  const [rails, films, upcoming, upcomingFilms, zone] = await Promise.all([
    cachedUpNextRails(userId),
    cachedWatchlistFilms(userId),
    cachedUpcomingEpisodes(userId),
    cachedUpcomingFilms(userId),
    requireTimezone(),
  ]);

  /**
   * **The one clock this route reads, read once.** `upcoming-grouping.ts` takes the
   * reader's zone and an instant as arguments and reads no clock itself, which is what
   * makes *Today means my today* something a test can state. Deliberately outside the
   * cache: the rows are the same set at every hour, but *Tomorrow* turns over at the
   * reader's midnight.
   */
  const today = readerDay(zone, new Date());

  /**
   * Issue #365's rail of titles to add, one per empty state. Constructed, not awaited —
   * the search screen's shape (`search/page.tsx`): an element only reads TMDB if the
   * empty state that holds it actually renders, and its own `Suspense` keeps that read off
   * the page's first byte. No fallback, for the search screen's reason.
   */
  const suggestionsFor = (labelId: string) => (
    <Suspense fallback={null}>
      <SuggestionRail userId={userId} labelId={labelId} />
    </Suspense>
  );

  const watching = (
    <HoldOver>
      <UpNextWatching
        rails={rails}
        films={films}
        suggestions={suggestionsFor("suggestions-watching")}
      />
    </HoldOver>
  );
  const comingUp = (
    <UpcomingSurface
      episodes={upcoming}
      films={upcomingFilms}
      today={today}
      suggestions={suggestionsFor("suggestions-coming-up")}
    />
  );

  return (
    <NavTransition>
      <main className="flex w-full flex-1 flex-col">
        <UpNextHeading />

        {/* One structure, drawn once, on every screen size: what you are watching, and
            what is coming up, paged. It used to be drawn twice — the pager for phones and a
            stacked copy for desktops, one hidden by CSS — which mounted every card twice:
            two marks stores' worth of subscriptions, and two `ViewTransition`s per poster
            sharing a name, which breaks the poster morph on both. Each half answers its own
            empty case, and a failure in any read throws past both into `error.tsx`. */}
        <div className="w-full lg:max-w-6xl">
          <LandingPager upNext={watching} upcoming={comingUp} />
        </div>
      </main>
    </NavTransition>
  );
}
