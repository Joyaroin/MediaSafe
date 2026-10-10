import { readerDay } from "@/app/(signed-in)/up-next/upcoming-grouping";
import { listWatchesSince, type UserId } from "@/db/access";
import { requireTimezone } from "@/lib/session";
import { buildHeatmap, yearWindowSince } from "./heatmap";
import { YearHeatmap } from "./year-heatmap";

/**
 * You's year of watching — issue #372. The read and the reader's zone, bucketed on the
 * server (`heatmap.ts`), handed to the grid as plain data.
 *
 * No `try`: a failed read throws to `you/error.tsx`, never an empty grid that would say the
 * reader watched nothing all year. A year with no dated watch in it renders nothing at all,
 * the rails' *absent, not empty* rule.
 */
export async function YearOfWatching({ userId }: { readonly userId: UserId }) {
  const now = new Date();
  const [watches, zone] = await Promise.all([
    listWatchesSince(userId, yearWindowSince(now)),
    requireTimezone(),
  ]);

  const heatmap = buildHeatmap(watches, zone, readerDay(zone, now));
  if (heatmap.total === 0) return null;

  return <YearHeatmap heatmap={heatmap} />;
}
