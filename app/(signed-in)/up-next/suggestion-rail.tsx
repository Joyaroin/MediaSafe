import { RailReadFailure } from "@/app/(signed-in)/search/rail-read-failure";
import type { UserId } from "@/db/access";
import { SuggestionCard } from "./suggestion-card";
import { readSuggestions } from "./suggestions";

/**
 * Titles to add, under an empty Up next or an empty Coming up — issue #365.
 *
 * The search screen's rail (`search/recommendation-rail.tsx`) in shape and in its three
 * outcomes, with one difference: every card carries the search screen's one-tap *Add*,
 * because the reader came here with nothing to do and adding is the thing to do.
 *
 * - **The read failed**: the inline read failure in the rail's place, and the empty
 *   state's own sentence above it stands (`AGENTS.md`'s blast-radius table).
 * - **Nothing to offer**: no heading over an empty track — nothing at all.
 * - Otherwise *Because you watched* the seed, or *Trending this week* when there is none.
 *
 * `labelId` is the caller's: Tonight and Coming up each draw one, under their own id.
 */
export async function SuggestionRail({
  userId,
  labelId,
}: {
  userId: UserId;
  labelId: string;
}) {
  const outcome = await readSuggestions(userId);

  if (!outcome.ok) {
    return (
      <section className="px-gutter pb-8">
        <RailReadFailure reference={outcome.reference} />
      </section>
    );
  }

  const { seed, results } = outcome.rail;
  if (results.length === 0) return null;

  return (
    <section className="pb-8">
      <div className="flex items-baseline justify-between gap-3 px-gutter pb-3">
        <h2 id={labelId} className="label-line text-dim">
          {seed === null ? "Trending this week" : "Because you watched"}
        </h2>
        {seed === null ? null : (
          <span className="min-w-0 truncate text-meta text-dim">{seed}</span>
        )}
      </div>

      <ol
        aria-labelledby={labelId}
        className="stagger-rise flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-pl-gutter px-gutter [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {results.map((result, index) => (
          <SuggestionCard
            key={`${result.kind}:${result.tmdbId}`}
            result={result}
            aboveFold={index < 2}
          />
        ))}
      </ol>
    </section>
  );
}
