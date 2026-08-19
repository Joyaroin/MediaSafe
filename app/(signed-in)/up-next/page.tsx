import { ProgrammeNoteLayout } from "@/app/(signed-in)/library/programme-note-layout";
import { listUpNext, listUpNextRails } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { UpNextEmpty } from "./up-next-empty";
import { UpNextHeading } from "./up-next-heading";
import { UpNextRailsSurface } from "./up-next-rails-surface";
import { UpNextSurface } from "./up-next-surface";

/**
 * Up next — the surface both devices land on, and the one this app is opened to look at.
 *
 * Built at its own route by #101, made the landing screen by #102, made a desktop
 * destination by #136, and given a desktop form of its own by **#137**: three rails beside
 * the programme note, where the phone still has the deck.
 *
 * ── Two reads and two renders, and the cost of that, stated ───────────────────────────
 *
 * `listUpNextRails` answers the desktop and `listUpNext` answers the phone, and both run on
 * every load because **the server does not know the viewport** — #136 deleted the one
 * `matchMedia` branch this build ever had, deliberately, so which surface renders is a
 * Tailwind fact and not a server one. `hidden lg:block` and `lg:hidden` are the same device
 * the deleted desktop TONIGHT row used, for the same reason.
 *
 * **Be precise about what that costs, because it is more than a second query.** Both halves
 * are in the markup at every width, so a phone is sent and hydrates every rail tile —
 * OLD FRIENDS is uncapped, which is 187 of them on the committed library — and a desktop
 * hydrates the whole first page of the deck. The images are not part of that: a browser does
 * not fetch a `loading="lazy"` poster inside a `display: none` subtree, so the wasted half
 * costs DOM and hydration, not bandwidth or TMDB requests.
 *
 * It is not paid for long, and it is not paid to buy anything: issue #138 replaces the deck
 * with the phone's own five vertical groups, at which point the deck read and the deck
 * render both go and the rails read serves the surface that is left. Fixing it before then
 * would mean either reading the viewport in JavaScript on the server's behalf — the one
 * thing #136 removed — or two routes for one destination.
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
 * empty is a different fact, answered by `up-next-rails-surface.tsx` rather than here, since
 * that is the component holding all three. The phone's own empty deck is the branch that
 * *is* here, because the deck is the only thing this page reads for it. All three are
 * reachable only from a query that succeeded.
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

  return (
    /* The Library page's own two-pane shell — the rails swap the panel beside them, and
       nothing on this page ever navigates. */
    <ProgrammeNoteLayout>
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

        {/* The desktop's three rails, which answer their own empty case. */}
        <div className="hidden lg:block">
          <UpNextRailsSurface rails={rails} />
        </div>
      </div>
    </ProgrammeNoteLayout>
  );
}
