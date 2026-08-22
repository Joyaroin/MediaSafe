import type { LibraryStateGroupEntry, UpNextRails } from "@/db/access";
import { BulkSelectionProvider } from "@/app/(signed-in)/library/bulk-selection-provider";
import { HomeGroup } from "./home-group";
import { TitleSheetProvider } from "./title-sheet";
import { UpNextEmpty } from "./up-next-empty";

/**
 * The phone home — issue #138, which **replaces** the deck `SPEC.md` §8 step 5 built.
 * Five vertical groups, stacked, each a few titles and a `more ›` into a screen holding
 * the whole of it: **ONGOING · COMING BACK · OLD FRIENDS**, the same three rules the
 * desktop rails read (`up-next-rails-surface.tsx`, `db/access.ts`'s `listUpNextRails`),
 * then **WATCHLIST** and **ABANDONED** — the two states the desktop does not show, because
 * the desktop reaches them through Library's own chips two centimetres below its rails and
 * the phone does not carry those chips anywhere on this screen.
 *
 * `design/catalogue-wall.html`'s `RAILS_PHONE`, binding on appearance and on order.
 *
 * ── ⚠️ No recording control anywhere on this surface ──────────────────────────────────
 *
 * The reversal issue #138 states rather than buries: `SPEC.md` §8 step 5 built this route
 * to deliver *the daily scene at one tap from a cold open*, and #11 forbids regressing the
 * highest-frequency scene against the app being replaced — and this surface does both,
 * deliberately, put to Adham twice with the cost stated both times and chosen both times.
 * To mark an episode, open the title; `HomeGroup`'s tiles are `Link`s and carry no control
 * of their own. **Do not helpfully re-add one.**
 *
 * ── Server component ──────────────────────────────────────────────────────────────────
 *
 * Nothing here is interactive — every tile is a plain `Link` — so this is rendered once on
 * the server, the same split `up-next-rails-surface.tsx` draws for the desktop rails and
 * for the identical reason.
 *
 * ── One empty state, and it is not any one group's ────────────────────────────────────
 *
 * A single empty group renders nothing (`home-group.tsx`). **All five** empty is a
 * different, rarer fact than the old deck's empty case: it now also asks whether the
 * watchlist and the abandoned pile are both bare, so it is checked here, once, across all
 * five arrays — reachable only because every read behind them succeeded and found nothing.
 * A failed read never reaches this component at all; it throws past `page.tsx` into
 * `error.tsx`, which is what keeps *you're caught up* from ever standing in for a database
 * that is down (`AGENTS.md`).
 */
export function UpNextGroups({
  rails,
  watchlist,
  abandoned,
}: {
  rails: UpNextRails;
  watchlist: readonly LibraryStateGroupEntry[];
  abandoned: readonly LibraryStateGroupEntry[];
}) {
  if (
    rails.ongoing.length === 0 &&
    rails.comingBack.length === 0 &&
    rails.oldFriends.length === 0 &&
    watchlist.length === 0 &&
    abandoned.length === 0
  ) {
    return <UpNextEmpty />;
  }

  return (
    /* Every tile below opens over this surface rather than navigating into the Library.
       The provider is here, wrapping all five groups, rather than inside `HomeGroup`:
       one sheet serves the whole tab, so opening a second title while the first is up
       replaces what is in the sheet instead of stacking a second one over it.

       `BulkSelectionProvider` sits outside it, unchanged from `library-surface.tsx`'s own
       mount (issue #198) — availability is a fact about the tree, and this whole
       component only ever renders inside `page.tsx`'s `lg:hidden`, so there is nothing
       for its own internal `1024px` check to disagree with. It renders `SelectionActionBar`
       itself, which is the #197 bar in full: the count, *Add to list* and *Done* are not
       reimplemented here. */
    <BulkSelectionProvider>
      <TitleSheetProvider>
        {/* Turn 9: *five groups → 104px tab-bar clearance*. `(signed-in)/layout.tsx`
            already reserves the bar's own height for every screen in the group, so what
            this adds is the remainder — written as the subtraction rather than as the
            `29px` it currently evaluates to, so the clearance stays 104px if the bar is
            ever redrawn. */}
        <div className="pb-[calc(104px-var(--tab-bar-height))]">
          <HomeGroup label="Ongoing" href="/up-next/ongoing" entries={rails.ongoing} />
          <HomeGroup
            label="Coming back"
            href="/up-next/coming-back"
            entries={rails.comingBack}
          />
          <HomeGroup
            label="Old friends"
            href="/up-next/old-friends"
            entries={rails.oldFriends}
          />
          <HomeGroup label="Watchlist" href="/up-next/watchlist" entries={watchlist} />
          {/* The only place `abandoned` is passed. It is the group rather than the tile
              that knows, because these five arrays are five separate reads and only this
              one is entirely abandoned titles — `home-group.tsx` has the longer reason. */}
          <HomeGroup
            label="Abandoned"
            href="/up-next/abandoned"
            entries={abandoned}
            abandoned
          />
        </div>
      </TitleSheetProvider>
    </BulkSelectionProvider>
  );
}
