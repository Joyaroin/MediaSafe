import Link from "next/link";

import { episodeCode } from "@/app/(signed-in)/up-next/episode-card-line";
import { Poster } from "@/app/poster";
import { listRecentWatches, type RecentWatch, type UserId } from "@/db/access";
import { requireTimezone } from "@/lib/session";
import { watchDayInWords } from "./watch-day";

/**
 * You's *Recently watched* — issue #371: the last ten dated watches, newest first, above
 * the figures.
 *
 * ── Its own read, in its own server component ────────────────────────────────────────
 *
 * `RecentlyWatchedSection` reads for itself rather than through `page.tsx`'s
 * `Promise.all`, so the page gains one line for it. It has no `try`: a failed read throws
 * past it into `you/error.tsx`, which replaces the whole of You with the read-failure
 * treatment. A section that went quiet on a failure would be *you have watched nothing
 * lately*, which is the lie `AGENTS.md` opens on.
 *
 * ── Absent, not empty ────────────────────────────────────────────────────────────────
 *
 * A reader with no dated watches gets no section at all — no heading, no reserved space —
 * which is `YouRail`'s rule for the rails below. Only a read that succeeded can get here.
 *
 * Neutral throughout, like the rest of You: the day is `text-dim`, not the accent Up
 * next's Upcoming uses for a countdown, because nothing here is live.
 */
export async function RecentlyWatchedSection({ userId }: { readonly userId: UserId }) {
  const [watches, zone] = await Promise.all([listRecentWatches(userId), requireTimezone()]);
  return <RecentlyWatched watches={watches} zone={zone} now={new Date()} />;
}

export function RecentlyWatched({
  watches,
  zone,
  now,
}: {
  readonly watches: readonly RecentWatch[];
  readonly zone: string;
  readonly now: Date;
}) {
  if (watches.length === 0) return null;

  return (
    <section aria-labelledby="recently-watched" className="px-gutter pt-4 pb-2 lg:px-10">
      <h2 id="recently-watched" className="bill-title text-bill-xs text-text">
        Recently watched
      </h2>

      <ol className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {watches.map((one) => (
          <RecentWatchRow key={one.watchId} watch={one} zone={zone} now={now} />
        ))}
      </ol>
    </section>
  );
}

function RecentWatchRow({
  watch,
  zone,
  now,
}: {
  readonly watch: RecentWatch;
  readonly zone: string;
  readonly now: Date;
}) {
  const what =
    watch.seasonNo === null || watch.episodeNo === null
      ? "Film"
      : watch.episodeName === null
        ? episodeCode(watch.seasonNo, watch.episodeNo)
        : `${episodeCode(watch.seasonNo, watch.episodeNo)} · ${watch.episodeName}`;
  const day = watchDayInWords(watch.watchedAt, zone, now);

  return (
    <li>
      <Link
        href={`/titles/${watch.libraryEntryId}`}
        className="pressable flex items-center gap-3 rounded-[var(--radius-6)] bg-raised plate-line p-2.5"
        aria-label={`${watch.titleName} — ${what}, ${day}`}
      >
        <Poster
          posterPath={watch.posterPath}
          name={watch.titleName}
          width={40}
          className="w-10 shrink-0 [--poster-radius:var(--radius-4)]"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-item text-text">{watch.titleName}</p>
          <p className="mt-[3px] truncate text-meta text-dim">{what}</p>
        </div>

        <p className="shrink-0 code-line text-dim" data-numeric>
          {day}
        </p>
      </Link>
    </li>
  );
}
