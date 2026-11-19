import type { UserId } from "@/db/access";
import { readRecentlyAdded } from "./recently-added-read";
import { RecentlyAddedView } from "./recently-added-view";

/** The server half of *Recently added*: the read, then `recently-added-view.tsx`. */
export async function RecentlyAdded({ userId }: { userId: UserId }) {
  return <RecentlyAddedView outcome={await readRecentlyAdded(userId)} />;
}
