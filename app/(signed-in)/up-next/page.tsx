import { ProgrammeNoteLayout } from "@/app/(signed-in)/library/programme-note-layout";
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
import { UpNextPhoneRails } from "./up-next-rails";
import { UpNextRailsSurface } from "./up-next-rails-surface";
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
 * build ever had, deliberately, so which surface renders is a Tailwind fact and not a
 * server one. `hidden lg:block` and `lg:hidden` below are the same device the deleted
 * desktop TONIGHT row used, for the same reason.
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
   * **The one clock this route reads, read once** — issue #251, widened by issue #319 to
   * hand the same instant to a second reader rather than gaining a second one of its own.
   *
   * `upcoming-grouping.ts` and `up-next-heading-band.ts` each take the reader's zone and an
   * instant as arguments and read no clock themselves, which is what makes *Today means my
   * today* and *the heading's word means my hour* things a test can state. Somebody has to
   * look at the actual time for that, and it is here: one instant, one zone, handed down to
   * both — a second clock read anywhere under `up-next/` would be a second answer to
   * *what time is it*, the same failure a second answer to *what day is it* would be.
   *
   * `requireTimezone()` reads `user.timezone` off the session — the column `lib/timezone.ts`
   * fills at signup and Settings' control changes, and which `SPEC.md` §5 makes the
   * read-time lens for every day boundary in the application. It is `NOT NULL`, so there is
   * no "or else" branch here and there is not meant to be one.
   *
   * **Deliberately outside the cache.** `cachedUpcomingEpisodes` returns a window a day
   * wider than the server's own day, which is the same set of rows for this account at
   * every hour; *Today* and *Tomorrow*, and now the heading's word, are truths that turn
   * over at the reader's midnight and the reader's hour — neither of which is a boundary
   * `serverDay()` or a cached read keys on. So the rows are cached and the instant is not.
   */
  const now = new Date();
  const today = readerDay(zone, now);

  return (
    <NavTransition>
      {/* The Library page's own two-pane shell — the rails swap the panel beside them,
          and nothing on this page ever navigates. */}
      <ProgrammeNoteLayout>
        <div className="flex min-w-0 flex-1 flex-col">
          <UpNextHeading zone={zone} at={now} />

          {/* The phone's two-page pager: the two rails, and Upcoming beside them. Each
              page answers its own empty case; a failure in either read throws past both
              into `error.tsx`.

              **The desktop does not get this.** `SPEC.md`'s *Specced, but later* still
              carries *desktop rails other than Up next's three (Upcoming)*, and #245 asks
              for a phone pager rather than a second desktop rail — so the gate below is
              the same `lg:hidden` the phone's rails already sat behind, and the desktop's
              three rails are untouched. */}
          <div className="lg:hidden">
            <LandingPager
              upNext={<UpNextPhoneRails rails={rails} films={films} />}
              upcoming={
                <UpcomingSurface episodes={upcoming} films={upcomingFilms} today={today} />
              }
            />
          </div>

          {/* The desktop's three rails, which answer their own empty case. */}
          <div className="hidden lg:block">
            <UpNextRailsSurface rails={rails} />
          </div>
        </div>
      </ProgrammeNoteLayout>
    </NavTransition>
  );
}
