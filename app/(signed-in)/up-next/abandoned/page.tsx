import { listAbandoned } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { GroupScreen } from "../group-screen";

/**
 * ABANDONED's own screen — the `more ›` under the phone home's fifth group (issue #138),
 * the second of the two states the desktop does not show at all. See `watchlist/page.tsx`
 * for why this reads `library_entry_state` directly rather than deriving anything new.
 */
export const dynamic = "force-dynamic";

export default async function AbandonedGroupPage() {
  const userId = await requireUserId();
  const entries = await listAbandoned(userId);

  return <GroupScreen label="Abandoned" entries={entries} />;
}
