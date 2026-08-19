import { ProgrammeNotePane } from "@/app/(signed-in)/library/programme-note";
import { listUpNext, listUpNextRails } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { UpNextEmpty } from "./up-next-empty";
import { UpNextHeading } from "./up-next-heading";
import { UpNextPanelSelection } from "./up-next-panel-selection";
import { UpNextRails } from "./up-next-rails";
import { UpNextSurface } from "./up-next-surface";

/**
 * Up next — the surface both devices land on, and the one this app is opened to look at.
 *
 * Built at its own route by #101, made the landing screen by #102, made a desktop
 * destination by #136, and given a desktop form of its own by **#137**: three rails beside
 * the programme note, where the phone still has the deck.
 *
 * ── Two reads, and why for now there are two ──────────────────────────────────────────
 *
 * `listUpNextRails` answers the desktop and `listUpNext` answers the phone, and both run on
 * every load because **the server does not know the viewport** — #136 deleted the one
 * `matchMedia` branch this build ever had, deliberately, so which surface renders is a
 * Tailwind fact and not a server one. The cost is one extra query per load, and it is
 * temporary in exactly one direction: issue #138 replaces the deck with the phone's own five
 * vertical groups, at which point the deck read goes with it and the rails read serves both.
 *
 * Both are unguarded. A failure in either throws into `error.tsx`, which draws the
 * read-failure treatment with a reference id over this page's own heading. There is no `try`
 * here and none in `db/access.ts`: **this is the surface `AGENTS.md`'s rule bites hardest
 * on**, because *you're caught up* is a plausible lie and a rail that is absent because the
 * database is down would read as a life well managed.
 *
 * ── Three empty states, and they are not one ──────────────────────────────────────────
 *
 * An **empty rail** is absent — no heading over nothing (`up-next-rail.tsx`). **Every** rail
 * empty is a different fact, and it gets `UpNextEmpty`'s *you're caught up*: a library with
 * nothing watching and nothing dated to return. The phone's own empty deck reaches the same
 * component by its own branch. All three are reachable only from a query that succeeded.
 *
 * Note that the two devices can honestly disagree here. A library that is entirely caught up
 * with a season announced has an empty deck and a populated COMING BACK rail, so the phone
 * says *you're caught up* while the desktop shows a rail. Both are true — the deck holds
 * *watching* and that rail does not — and #138 is where the phone gains the groups that
 * close the gap.
 */
export const dynamic = "force-dynamic";

export default async function UpNextPage() {
  const userId = await requireUserId();

  const rails = await listUpNextRails(userId);
  const deck = await listUpNext(userId);

  const everyRailIsEmpty =
    rails.ongoing.length === 0 &&
    rails.comingBack.length === 0 &&
    rails.oldFriends.length === 0;

  return (
    <main className="flex w-full flex-1 flex-col lg:flex-row">
      <UpNextPanelSelection>
        <div className="flex min-w-0 flex-1 flex-col">
          <UpNextHeading />

          {/* The phone's deck, unchanged, until #138. */}
          <div className="lg:hidden">
            {deck.entries.length === 0 ? (
              <UpNextEmpty />
            ) : (
              <UpNextSurface firstPage={deck} />
            )}
          </div>

          {/* The desktop's three rails. */}
          <div className="hidden lg:block">
            {everyRailIsEmpty ? <UpNextEmpty /> : <UpNextRails rails={rails} />}
          </div>
        </div>

        {/* The Library page's own panel, which renders itself only past `lg` — the rails
            swap its contents, and nothing on this page ever navigates. */}
        <ProgrammeNotePane />
      </UpNextPanelSelection>
    </main>
  );
}
