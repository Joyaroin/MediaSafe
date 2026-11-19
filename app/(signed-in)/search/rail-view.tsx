import type { KindMode } from "@/app/(signed-in)/library/kind-mode";
import type { CatalogueResult } from "@/tmdb/mirror";
import { PosterRail } from "./poster-rail";
import { RailReadFailure } from "./rail-read-failure";
import type { RailOutcome } from "./recommendations";

/**
 * What a rail's read answered, drawn — *Because you watched* or *Trending this week*.
 * `recommendation-rail.tsx` owns the read and this file only renders it, so the three ways
 * a rail can come out are testable without the server-only read behind them.
 *
 *  - **The read failed.** The inline read failure, **in the rail's place and nowhere
 *    else** (`AGENTS.md`'s blast-radius table), with its reference and a real retry. The
 *    field above keeps working.
 *  - **The read succeeded and found nothing.** Nothing: no heading over an empty track.
 *  - **Otherwise** the rail.
 */
export function RailView({ outcome, mode }: { outcome: RailOutcome; mode: KindMode }) {
  if (!outcome.ok) {
    return (
      <section className="pt-8">
        {/* A thin client wrapper, because this region is server-rendered and has no
            client-side read to run again — `rail-read-failure.tsx` has the argument. */}
        <RailReadFailure reference={outcome.reference} />
      </section>
    );
  }

  const { rail } = outcome;
  if (rail.results.length === 0) return null;

  const tiles = rail.results.map((result) => ({
    key: `${result.kind}:${result.tmdbId}`,
    // Catalogue detail, not the library route: none of these is yours yet, so there is no
    // library entry to open (`/catalogue/[kind]/[tmdbId]`).
    href: `/catalogue/${result.kind}/${result.tmdbId}`,
    name: result.name,
    posterPath: result.posterPath,
    caption: audienceCaption(result),
  }));

  // One rail per mode renders on this screen, so the heading's id carries the kind and the
  // mode — a shared id would hand both tracks the first heading's name.
  return rail.kind === "because-you-watched" ? (
    <PosterRail
      headingId={`because-you-watched-${mode}`}
      heading="Because you watched"
      aside={rail.seed.name}
      tiles={tiles}
    />
  ) : (
    <PosterRail
      headingId={`trending-this-week-${mode}`}
      heading="Trending this week"
      aside={mode === "show" ? "Shows" : "Films"}
      tiles={tiles}
    />
  );
}

/**
 * The **audience score**, which is not your rating. Labelled rather than left as a bare
 * star, so the number is unmistakably somebody else's opinion and not a control you have
 * set.
 */
function audienceCaption(result: CatalogueResult): string | null {
  return result.audienceScore === null ? null : `Audience ${result.audienceScore.toFixed(1)}`;
}
