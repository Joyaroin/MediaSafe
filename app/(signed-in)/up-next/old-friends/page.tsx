import { cachedUpNextRails } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { GroupScreen } from "../group-screen";

/**
 * OLD FRIENDS' own screen — the `more ›` under the phone home's third group (issue #138),
 * and the one acceptance criteria singles out at real scale: **around two hundred titles**
 * on the committed library. See `ongoing/page.tsx` for why this reads all three rails and
 * keeps only one, and `group-screen.tsx` for the fetch strategy at this size — one
 * unbounded read, the same one the desktop rail already renders in full.
 */
export const dynamic = "force-dynamic";

export default async function OldFriendsGroupPage() {
  const userId = await requireUserId();
  const rails = await cachedUpNextRails(userId);

  return <GroupScreen label="Old friends" entries={rails.oldFriends} />;
}
