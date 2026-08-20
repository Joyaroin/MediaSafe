import { ProgrammeNoteLayout } from "@/app/(signed-in)/library/programme-note-layout";
import { listAbandoned, listUpNextRails, listWatchlist } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { UpNextGroups } from "./up-next-groups";
import { UpNextHeading } from "./up-next-heading";
import { UpNextRailsSurface } from "./up-next-rails-surface";

/**
 * Up next — the surface both devices land on, and the one this app is opened to look at.
 *
 * Built at its own route by #101, made the landing screen by #102, made a desktop
 * destination by #136, given a desktop form of its own by #137 — three rails beside the
 * programme note — and given the phone a form of its own, at last, by **#138**: five
 * vertical groups, replacing the deck `SPEC.md` §8 step 5 built. The deck's own read,
 * `listUpNext`, and everything that rendered it, are gone with it.
 *
 * ── Three reads and two renders, and the cost of that, stated ─────────────────────────
 *
 * `listUpNextRails` answers both devices — the phone's first three groups and the
 * desktop's three rails are the same read — and `listWatchlist`/`listAbandoned` answer
 * only the phone's last two. All three run on every load because **the server does not
 * know the viewport** — #136 deleted the one `matchMedia` branch this build ever had,
 * deliberately, so which surface renders is a Tailwind fact and not a server one.
 * `hidden lg:block` and `lg:hidden` below are the same device the deleted desktop TONIGHT
 * row used, for the same reason.
 *
 * **Be precise about what that costs.** A desktop load pays for the watchlist and
 * abandoned reads without ever rendering them — the images are not part of that cost, since
 * a browser does not fetch a `loading="lazy"` poster inside a `display: none` subtree, so
 * the wasted read costs one query and some DOM, not bandwidth or TMDB requests. It is the
 * same trade #137's own docblock made for the rails on a phone load, paid the other way
 * now that the deck is gone: two surfaces sharing one route and reading everything either
 * of them might render, rather than a second route for one destination.
 *
 * Every read here is unguarded. A failure in any of the three throws into `error.tsx`,
 * which draws the read-failure treatment with a reference id over this page's own
 * heading. There is no `try` here and none in `db/access.ts`: **this is the surface
 * `AGENTS.md`'s rule bites hardest on**, because *you're caught up* is a plausible lie and
 * a group that is absent because the database is down would read as a life well managed.
 *
 * ── Two empty states, and they are not one ────────────────────────────────────────────
 *
 * An **empty group** is absent — no heading over nothing (`home-group.tsx`). **All groups
 * on one device empty** is a different fact, answered by `up-next-groups.tsx` and
 * `up-next-rails-surface.tsx` respectively rather than here, since each of those is the
 * component holding every group or rail its own device shows. Both are reachable only
 * from reads that succeeded.
 *
 * The two devices can honestly disagree here, more often than they could before #138: a
 * library with nothing watching, nothing dated to come back, nothing on the watchlist and
 * nothing abandoned — but titles finished — reads as *you're caught up* on both devices at
 * once now, where before #138 the phone's deck alone decided its own answer. What still
 * differs is which five, or three, questions get asked.
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
  const [rails, watchlist, abandoned] = await Promise.all([
    listUpNextRails(userId),
    listWatchlist(userId),
    listAbandoned(userId),
  ]);

  return (
    /* The Library page's own two-pane shell — the rails swap the panel beside them, and
       nothing on this page ever navigates. */
    <ProgrammeNoteLayout>
      <div className="flex min-w-0 flex-1 flex-col">
        <UpNextHeading />

        {/* The phone's five vertical groups. */}
        <div className="lg:hidden">
          <UpNextGroups rails={rails} watchlist={watchlist} abandoned={abandoned} />
        </div>

        {/* The desktop's three rails, which answer their own empty case. */}
        <div className="hidden lg:block">
          <UpNextRailsSurface rails={rails} />
        </div>
      </div>
    </ProgrammeNoteLayout>
  );
}
