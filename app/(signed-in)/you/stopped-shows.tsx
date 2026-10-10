import { listStoppedShows, type UserId } from "@/db/access";
import { StoppedShowsRail } from "./stopped-shows-rail";

/**
 * You's *Shows you stopped* — issue #373. Its own read, so `page.tsx` gains one line; no
 * `try`, so a failed read throws to `you/error.tsx` rather than rendering as a reader who
 * never stopped anything. None stopped renders nothing at all.
 */
export async function StoppedShows({ userId }: { readonly userId: UserId }) {
  const entries = await listStoppedShows(userId);
  if (entries.length === 0) return null;

  return <StoppedShowsRail entries={entries} />;
}
