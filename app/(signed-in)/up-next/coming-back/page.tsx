import { cachedUpNextRails } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { GroupScreen } from "../group-screen";

/**
 * COMING BACK's own screen — the `more ›` under the phone home's second group (issue
 * #138). See `ongoing/page.tsx` for why this reads all three rails and keeps only one.
 */
export const dynamic = "force-dynamic";

export default async function ComingBackGroupPage() {
  const userId = await requireUserId();
  const rails = await cachedUpNextRails(userId);

  return <GroupScreen label="Coming back" entries={rails.comingBack} />;
}
