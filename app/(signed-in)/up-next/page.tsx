import { ProgrammeNoteLayout } from "@/app/(signed-in)/library/programme-note-layout";
import { cachedUpNextRails, cachedWatchlistFilms } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
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
 * ── Two reads and two renders, and the cost of that, stated ───────────────────────────
 *
 * `listUpNextRails` answers both devices — the phone's single next-episodes rail is the
 * desktop's three concatenated, from the same read, in the same order — and
 * `listWatchlistFilms` answers only the phone's second rail. Both run on every load because
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
   * Concurrent, not sequential. None of the three reads takes any part of another's
   * result, so awaiting them one after another bought nothing and cost two extra round
   * trips to Neon in front of the first byte of this page — on a driver where a round
   * trip is a WebSocket message and not a local socket write.
   *
   * `Promise.all` rejects on the first rejection, which is the behaviour this page's
   * error discipline already asks for: any one of the three failing throws into
   * `error.tsx` exactly as it did when they ran in series. Nothing here catches, and the
   * unguarded reads above the `AGENTS.md` rule protects are still unguarded.
   */
  const [rails, films] = await Promise.all([
    cachedUpNextRails(userId),
    cachedWatchlistFilms(userId),
  ]);

  return (
    <NavTransition>
      {/* The Library page's own two-pane shell — the rails swap the panel beside them,
          and nothing on this page ever navigates. */}
      <ProgrammeNoteLayout>
        <div className="flex min-w-0 flex-1 flex-col">
          <UpNextHeading />

          {/* The phone's two rails, which answer their own empty case. */}
          <div className="lg:hidden">
            <UpNextPhoneRails rails={rails} films={films} />
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
