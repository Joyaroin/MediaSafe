import type { KindMode } from "@/app/(signed-in)/library/kind-mode";
import type { UserId } from "@/db/access";
import { RailView } from "./rail-view";
import { readRail } from "./recommendations";

/**
 * One kind's rail over the search field: *Because you watched {seed}* where the reader has
 * watched something of this kind, otherwise *Trending this week* for it (issue #542).
 *
 * Recommendations were listed among the things deferred past v1; that deferral is reversed
 * rather than worked around, because a screen you arrive at with nothing to type is a screen
 * with nothing on it. `recommendations.ts` owns the read and the distinction between a
 * failure and an empty answer; `rail-view.tsx` draws it.
 */
export async function RecommendationRail({
  userId,
  mode,
}: {
  userId: UserId;
  mode: KindMode;
}) {
  return <RailView outcome={await readRail(userId, mode)} mode={mode} />;
}
