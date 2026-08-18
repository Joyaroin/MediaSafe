import { requireUserId } from "@/lib/session";
import { SearchSurface } from "./search-surface";
import { TmdbAttribution } from "./tmdb-attribution";

/**
 * Search — the catalogue, to add something you do not have.
 *
 * The first way anything gets into a library. Until this screen or import exists, every
 * library surface is unpopulatable, which is why `SPEC.md` §8's build order puts search
 * *with* the library rather than after it.
 *
 * ── One design at two densities ──────────────────────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §5 lists search among the four things that are one design
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
  await requireUserId();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-stock">Search</h1>

      <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-stock-dim">
        The catalogue of everything there is. Your own library is somewhere else.
      </p>

      <div className="mt-8 flex-1">
        <SearchSurface />
      </div>

      <TmdbAttribution />
    </main>
  );
}
