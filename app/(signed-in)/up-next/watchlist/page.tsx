import { listWatchlist } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { GroupScreen } from "../group-screen";

/**
 * WATCHLIST's own screen — the `more ›` under the phone home's fourth group (issue #138),
 * one of the two states the desktop does not show at all. `listWatchlist` filters
 * `library_entry_state` (`db/access.ts`) — the same derived state Library's own Watchlist
 * chip reads — rather than deriving anything new for this screen alone.
 */
export const dynamic = "force-dynamic";

export default async function WatchlistGroupPage() {
  const userId = await requireUserId();
  const entries = await listWatchlist(userId);

  return <GroupScreen label="Watchlist" entries={entries} />;
}
