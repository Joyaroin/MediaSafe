import { Suspense } from "react";

import { requireUserId } from "@/lib/session";
import { TmdbAttribution } from "@/app/tmdb-attribution";
import { KIND_MODES } from "@/app/(signed-in)/library/kind-mode";
import { NavTransition } from "../nav-transition";
import { RecommendationRail } from "./recommendation-rail";
import { SearchHeading } from "./search-heading";
import { SearchSurface } from "./search-surface";

/**
 * Search — the catalogue, to add something you do not have.
 *
 * The first way anything gets into a library. Until this screen or import exists, every
 * library surface is unpopulatable, which is why the build order puts search
 * *with* the library rather than after it.
 *
 * ── One design at two densities ──────────────────────────────────────────────────────
 *
 * Search is one of the four things that are one design
 * on both devices: *"identical on both. It is a low-frequency action on both devices and
 * there is no evidence the intent differs."* So there is no `lg:` divergence here beyond
 * the reading measure, and there is deliberately none to add.
 *
 * ── What this page is not ────────────────────────────────────────────────────────────
 *
 * It does not read the library. The one per-account question — *do you already have this*
 * — is asked inside the Server Action, alongside the search it qualifies, because the
 * answer is only meaningful about results that exist. A page-level read of the whole
 * library to mark up twenty rows would be the wrong read at the wrong time, and at 472
 * titles it would be the wrong size too.
 */

/**
 * Never prerendered. `/settings` carries the same line and the same reasoning: reading
 * the session reads cookies, which makes the route dynamic only *after* the attempt —
 * without this, `next build` starts a prerender, calls `requireUserId()`, and resolves
 * the pool against whatever `DATABASE_URL` the build environment has.
 */
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  /**
   * The gate. `proxy.ts` turned away a reader with no cookie at all; this is the check
   * that queries the session table, and `tests/route-manifest.test.ts` is what proves
   * this route is behind the matcher.
   *
   * The id is not used here — both actions resolve their own, because a Server Action is
   * a POST endpoint in its own right and cannot inherit a check that ran on a page render
   * minutes earlier.
   */
  const userId = await requireUserId();

  /**
   * One rail per mode, each built here and handed down as an already-rendered node.
   *
   * ── This page never awaits them ─────────────────────────────────────────────────────
   *
   * `<RecommendationRail>` is an async Server Component *constructed* rather than called,
   * so the read inside it does not gate this page's shell — the field is interactive while
   * TMDB is still answering. That is issue #218's shape, the one
   * `live-title-facts-streamed.tsx` uses for the three live facts, and it is why each rail
   * sits inside its own `Suspense`.
   *
   * **No fallback.** The three live facts each show a placeholder because they are holes
   * in a page that is otherwise complete, and a hole with nothing in it reads as missing.
   * A rail is not a hole: it appears under the field or it does not, and reserving a strip
   * of pending space for something that may turn out to be absent entirely — an account
   * with no watches — would be reserved space for a thing with nothing to
   * act on. It arrives when it arrives.
   *
   * Built from `KIND_MODES` rather than written out twice, so a mode cannot be added to
   * that list and silently get no rail.
   */
  const rails = Object.fromEntries(
    KIND_MODES.map((mode) => [
      mode.value,
      <Suspense key={mode.value} fallback={null}>
        <RecommendationRail userId={userId} mode={mode.value} />
      </Suspense>,
    ]),
  );

  return (
    <NavTransition>
      {/* `px-[22px]` is turn 9's page gutter, at every width:
          search is *identical on both devices*, so
          there is no `lg:` gutter to add. The results list inside `SearchSurface` carries
          its own `14px` instead, so that a card's edge sits inside the text gutter rather
          than on it. */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-[22px] pt-5 pb-12 lg:pb-16">
        <SearchHeading />

        <p className="mt-4 max-w-[62ch] text-item leading-relaxed text-dim">
          The catalogue of everything there is. Your own library is somewhere else.
        </p>

        <div className="mt-4 flex-1">
          <SearchSurface rails={rails} />
        </div>

        <TmdbAttribution className="mt-12 pt-3" />
      </main>
    </NavTransition>
  );
}
