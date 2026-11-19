import { PosterRail } from "./poster-rail";
import { RailReadFailure } from "./rail-read-failure";
import type { RecentlyAddedOutcome } from "./recently-added-read";

/**
 * *Recently added* — the last six titles you added, at the top of idle Search (issue #542).
 * A tile opens the title's page. Nothing at all while the library is empty: no heading over
 * an empty track. A failed read is the inline read failure in the region's place.
 *
 * Type-only import of the outcome: `recently-added-read.ts` is server-only, and this file is
 * kept free of it so the three outcomes can be rendered under Vitest.
 */
export function RecentlyAddedView({ outcome }: { outcome: RecentlyAddedOutcome }) {
  if (!outcome.ok) {
    return (
      <section className="pt-8">
        <RailReadFailure reference={outcome.reference} />
      </section>
    );
  }

  if (outcome.entries.length === 0) return null;

  return (
    <PosterRail
      headingId="recently-added"
      heading="Recently added"
      tiles={outcome.entries.map((entry) => ({
        key: entry.libraryEntryId,
        href: `/titles/${entry.libraryEntryId}`,
        name: entry.name,
        posterPath: entry.posterPath,
        caption: entry.releaseYear === null ? null : String(entry.releaseYear),
      }))}
    />
  );
}
