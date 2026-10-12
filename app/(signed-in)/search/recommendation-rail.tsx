import Link from "next/link";

import { Poster } from "@/app/poster";
import type { KindMode } from "@/app/(signed-in)/library/kind-mode";
import type { UserId } from "@/db/access";
import { RailReadFailure } from "./rail-read-failure";
import { readRecommendations, type Recommendations } from "./recommendations";

/**
 * *Because you watched* — the rail over the search field.
 *
 * ── What it is, and what was said about it ──────────────────────────────────────────
 *
 * Recommendations were listed among the things deferred past v1, alongside watch
 * providers, stats and year in review. Two of those four have since been built. This is
 * the third, and the deferral is being reversed rather than worked around: the search
 * screen's resting state was one dim line under a field, and a screen you arrive at with
 * nothing to type is a screen with nothing on it.
 *
 * ── Three ways this shows nothing, and only one of them is a failure ────────────────
 *
 * `recommendations.ts` owns the read and the distinction; this file only renders it.
 *
 *  - **No seed.** You have watched nothing of this kind. No heading, no empty track, no
 *    *watch something and this fills up*: reserving space is forbidden for
 *    something with nothing to act on, and a rail whose subject does not exist is that.
 *  - **Nothing recommended.** The read succeeded and came back empty. Also nothing, for
 *    the same reason — a heading over an empty track says less than no heading.
 *  - **The read failed.** The inline read failure, **in the rail's place and nowhere
 *    else** (`AGENTS.md`'s blast-radius table). The field above it keeps working, because
 *    a recommendation nobody asked for failing must not take away the control this screen
 *    exists for.
 */
export async function RecommendationRail({
  userId,
  mode,
}: {
  userId: UserId;
  mode: KindMode;
}) {
  const outcome = await readRecommendations(userId, mode);

  if (!outcome.ok) {
    return (
      <section className="pt-8">
        {/* A thin client wrapper, because this region is server-rendered and has no
            client-side read to run again — `rail-read-failure.tsx` has the argument for
            why that is a `router.refresh()` rather than a `ReadFailure` without a
            control. */}
        <RailReadFailure reference={outcome.reference} />
      </section>
    );
  }

  if (outcome.rail === null || outcome.rail.results.length === 0) return null;

  return <Rail rail={outcome.rail} mode={mode} />;
}

function Rail({ rail, mode }: { rail: Recommendations; mode: KindMode }) {
  // One rail per mode renders on this screen, so the heading's id carries the mode — a
  // shared id would hand both tracks the first heading's name.
  const headingId = `because-you-watched-${mode}`;

  return (
    // `-mx-gutter` cancels `page.tsx`'s own gutter, so the track can bleed to the edges
    // and the `px-gutter` below is the only one. Without it both applied: the head sat at
    // twice the gutter and the track was clipped short of the screen's edge.
    <section className="-mx-gutter pt-8">
      {/* The rail head keeps the page gutter while the track below bleeds to the edges —
          the settled pairing, at the same `22px` the four phone tabs use.

          The seed's name sits at the end of the row rather than inside the heading.
          *Because you watched Breaking Bad* as one string wraps to two lines on a narrow
          phone for any title of normal length at the serif Heading size — the section head
          every Rail carries (Charcoal §6), with its aside in Meta the way Coming up's day
          groups set their date. */}
      <div className="flex items-baseline justify-between gap-3 px-gutter pb-3">
        <h2 id={headingId} className="bill-title shrink-0 text-bill-lg text-text">
          Because you watched
        </h2>
        <span className="min-w-0 truncate text-meta text-dim">{rail.seed.name}</span>
      </div>

      <ol
        aria-labelledby={headingId}
        className="stagger-rise flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-pl-gutter px-gutter [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rail.results.map((result, index) => (
          <li
            key={`${result.kind}:${result.tmdbId}`}
            className="w-28 shrink-0 snap-start"
          >
            {/* Catalogue detail, not the library route: none of these is yours yet, so
                there is no library entry to open. `/catalogue/[kind]/[tmdbId]` is the page
                that already existed for an unowned title, and a press here navigates to
                it. It was intercepted into a dialog from #254 until #273 deleted the route
                interceptions. */}
            <Link
              href={`/catalogue/${result.kind}/${result.tmdbId}`}
              className="group block"
            >
              <Poster
                posterPath={result.posterPath}
                name={result.name}
                width={112}
                className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-1)]"
                // The first two are on screen without scrolling at every width this rail
                // is drawn at; the rest arrive as the track is swiped.
                aboveFold={index < 2}
              />

              {/* The Rail's caption (Charcoal §6): a `14/500` name over a `12px` dim line. */}
              <p className="mt-1.5 truncate text-item font-medium text-text">{result.name}</p>

              {/* The **audience score**, which is not your rating — `CatalogueResult`'s
                  own note carries the argument, and the placement is half of it: this
                  appears only where you are judging something you do not own. Labelled
                  rather than left as a bare star, so the number is unmistakably somebody
                  else's opinion and not a control you have set. */}
              {result.audienceScore === null ? null : (
                <p className="mt-0.5 truncate text-label text-dim">
                  Audience {result.audienceScore.toFixed(1)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
