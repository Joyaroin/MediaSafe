import { Suspense } from "react";

import { cachedUpcomingEpisodes, cachedUpcomingFilms } from "@/cache/tags";
import { requireTimezone, requireUserId } from "@/lib/session";
import { SuggestionRail } from "../up-next/suggestion-rail";
import { readerDay } from "../up-next/upcoming-grouping";
import { UpcomingSurface } from "../up-next/upcoming-surface";
import { NavTransition } from "../nav-transition";
import { ComingUpHeading } from "./coming-up-heading";

/**
 * Coming up — a destination of its own since Charcoal slice 5 (issue #399). Until then it
 * was the second page of the landing pager on `/up-next`; it shows exactly what that page
 * showed, and slice 7 redraws it.
 *
 * Two reads and the reader's zone, concurrently. All three are unguarded: `unstable_cache`
 * stores only a resolved value, so a rejection propagates and `error.tsx` draws the
 * read-failure treatment. *No release dates yet* is reachable only from reads that
 * succeeded — `AGENTS.md`'s rule, on the screen where *nothing coming* is most plausible.
 *
 * The surface's modules still live beside Up next's, where the pager put them. They move
 * with the redraw rather than in a change that only renames them.
 */
export const dynamic = "force-dynamic";

export default async function ComingUpPage() {
  const userId = await requireUserId();

  const [episodes, films, zone] = await Promise.all([
    cachedUpcomingEpisodes(userId),
    cachedUpcomingFilms(userId),
    requireTimezone(),
  ]);

  /**
   * **The one clock this route reads, read once.** `upcoming-grouping.ts` reads no clock
   * itself, which is what makes *Tomorrow means my tomorrow* something a test can state.
   * Outside the cache on purpose: the rows are the same set all day, but *Tomorrow* turns
   * over at the reader's midnight.
   */
  const today = readerDay(zone, new Date());

  return (
    <NavTransition>
      <main className="flex w-full flex-1 flex-col">
        <ComingUpHeading />

        <div className="w-full lg:max-w-6xl">
          <UpcomingSurface
            episodes={episodes}
            films={films}
            today={today}
            suggestions={
              /* Constructed, not awaited: the rail reads TMDB only if the empty state that
                 holds it renders, and its own `Suspense` keeps that read off the first byte. */
              <Suspense fallback={null}>
                <SuggestionRail userId={userId} labelId="suggestions-coming-up" />
              </Suspense>
            }
          />
        </div>
      </main>
    </NavTransition>
  );
}
