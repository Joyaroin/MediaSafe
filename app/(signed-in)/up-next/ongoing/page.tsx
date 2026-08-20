import { listUpNextRails } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { GroupScreen } from "../group-screen";

/**
 * ONGOING's own screen — the `more ›` under the phone home's first group (issue #138).
 * `listUpNextRails` is the desktop rail's own read and the only definition of ONGOING's
 * membership and order there is (`db/access.ts`); this asks for all three rails and keeps
 * only the one it names, rather than a second reader that could disagree with the rail
 * about which twelve are *the 12 most recently watched*.
 */
export const dynamic = "force-dynamic";

export default async function OngoingGroupPage() {
  const userId = await requireUserId();
  const rails = await listUpNextRails(userId);

  return <GroupScreen label="Ongoing" entries={rails.ongoing} />;
}
