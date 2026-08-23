import type { LibraryStateGroupEntry, UpNextRails } from "@/db/access";
import { HomeGroup } from "./home-group";
import { OngoingGroup } from "./ongoing-group";
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
 * ── ⚠️ Ongoing records a watch. The other four do not. — issue #220 ──────────────────
 *
 * This **reverses** #138's *no recording control anywhere on this surface at all; to mark
 * an episode or give up on a title, you open it*, and #138 is reopened with the reversal
 * on it rather than quietly worked around. The reasoning #138 gave was sound; what it cost
 * was that the app's most frequent action began by opening something, which is the same
 * complaint `SPEC.md` §8 step 5 exists to answer — the tap moved, it did not go away.
 * §8 step 5 is amended in place.
 *
 * **Ongoing only.** `OngoingGroup` below is the one group whose tiles carry a mark; Coming
 * back, Old friends, Watchlist and Abandoned are `HomeGroup` unchanged and carry none.
 * Those four are shows nobody is mid-episode on, a list one tap would *start*, and — the
 * sharpest — a pile where recording a watch would silently clear the one hand-set state in
 * this app. **Do not helpfully add a mark to any of them.**
 *
 * ── ⚠️ And the hold has gone, in exchange ────────────────────────────────────────────
 *
 * There is no `BulkSelectionProvider` here any more. #194 scoped selection to the Up next
 * tracks, the group screens and the Library grid; the Library half shipped and this
 * withdraws the Up next half, because a tile carrying tap-to-open, tap-to-mark and
 * hold-to-select is three meanings on one card. Selection is untouched on the Library grid,
 * on the five group screens behind *More* (`group-screen.tsx` still mounts a provider) and
 * on list detail rows. **The cost is recorded**: bulk *Add to list* and bulk *Abandon* are
 * one navigation away from this screen rather than on it.
 *
 * ── Server component, and one client island ───────────────────────────────────────────
 *
 * Four of the five groups are still rendered once on the server, the same split
 * `up-next-rails-surface.tsx` draws for the desktop rails. `OngoingGroup` is the island:
 * its tiles write, and which of them are still in the group is a question a press can
 * change without a read.
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
       The provider wraps all five groups rather than sitting inside `HomeGroup`: one sheet
       serves the whole tab, so opening a second title while the first is up replaces what
       is in the sheet instead of stacking a second one over it.

       There is no `BulkSelectionProvider` above it any more (issue #220) — the docblock
       says why, and it is the whole of how the hold left this surface. */
    <TitleSheetProvider>
      {/* Turn 9: *five groups → 104px tab-bar clearance*. `(signed-in)/layout.tsx`
          already reserves the bar's own height for every screen in the group, so what
          this adds is the remainder — written as the subtraction rather than as the
          `29px` it currently evaluates to, so the clearance stays 104px if the bar is
          ever redrawn. */}
      <div className="pb-[calc(104px-var(--tab-bar-height))]">
        {/* The one group that records a watch, and the one that is not a `HomeGroup`. */}
        <OngoingGroup entries={rails.ongoing} />
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
  );
}
