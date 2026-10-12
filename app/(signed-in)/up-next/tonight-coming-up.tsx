import Link from "next/link";

import type { UpcomingEpisode } from "@/db/access";
import { groupUpcoming, nextPerTitle } from "./upcoming-grouping";
import { UpcomingRow } from "./upcoming-row";

/**
 * The *Coming up* preview in Tonight's right column from `xl:` — Charcoal, issue #400
 * (handoff §8.1): the next three dated rows, in exactly the order `/coming-up` lists them
 * (one per show, by air date — `UpcomingSurface`'s own `nextPerTitle` then `groupUpcoming`),
 * and *See all* to the screen itself.
 *
 * Episodes only. Coming up lists its dated episodes before its awaited films, so for any
 * reader with three episodes announced these are the screen's first three rows; a reader
 * with fewer sees fewer here and the films on `/coming-up`. Nothing dated is no preview at
 * all — no heading over nothing.
 */
export function TonightComingUp({
  episodes,
  today,
}: {
  episodes: readonly UpcomingEpisode[];
  /** The reader's own day, `YYYY-MM-DD`. */
  today: string;
}) {
  const next = groupUpcoming(nextPerTitle(episodes), today)
    .flatMap((group) => group.episodes)
    .slice(0, PREVIEW_ROWS);

  if (next.length === 0) return null;

  return (
    <section aria-labelledby="tonight-coming-up-title" className="pt-8">
      <div className="-mr-3 flex min-h-11 items-center justify-between gap-3">
        <h2 id="tonight-coming-up-title" className="bill-title text-bill-lg text-text">
          Coming up
        </h2>
        <Link
          href="/coming-up"
          className="flex min-h-11 items-center px-3 text-item font-medium text-text hover:text-dim"
        >
          See all
        </Link>
      </div>
      {/* `dated`: there is no day heading over these three, so each row sets its own date
          and countdown — the form Coming up's *Later* rows take (#419). */}
      <ul className="stagger-rise mt-1">
        {next.map((episode) => (
          <UpcomingRow key={episode.episodeId} episode={episode} today={today} dated />
        ))}
      </ul>
    </section>
  );
}

const PREVIEW_ROWS = 3;
