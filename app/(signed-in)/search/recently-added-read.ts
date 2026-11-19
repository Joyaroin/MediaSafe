import "server-only";

import { cachedRecentlyAdded } from "@/cache/tags";
import type { RecentlyAddedEntry, UserId } from "@/db/access";
import { referenceFor } from "@/errors/reference";

/**
 * The read behind *Recently added*, as an `Outcome` — `recommendations.ts`' shape and its
 * argument: a failed read is carried as data and drawn in the region's place, so it cannot
 * take the search field with it, and it is not an empty result in disguise (`ok: false` has
 * no `entries` to read). An empty library is `ok: true` with no entries.
 */
export type RecentlyAddedOutcome =
  | { readonly ok: true; readonly entries: readonly RecentlyAddedEntry[] }
  | { readonly ok: false; readonly reference: string | null };

export async function readRecentlyAdded(userId: UserId): Promise<RecentlyAddedOutcome> {
  try {
    return { ok: true, entries: await cachedRecentlyAdded(userId) };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "recently-added" }) };
  }
}
