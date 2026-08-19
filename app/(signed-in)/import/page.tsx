import { requireUserId } from "@/lib/session";
import { ImportSurface } from "./import-surface";

/**
 * Import — the blocking progress screen (`SPEC.md` §7, `docs/design/v1-surfaces.md` §4
 * screen 3), and the route the browser drives in chunks of ~25 titles (issue #73).
 *
 * ── One design, no `lg:` divergence ───────────────────────────────────────────────────
 *
 * `SPEC.md` §7 lists four places layout genuinely diverges and this is not one of them —
 * the same "identical on both, low-frequency, no evidence the intent differs" argument
 * `app/(signed-in)/search/page.tsx` already makes for itself.
 *
 * ── Reachable directly today, permanently later ───────────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §4 screen 3: *"Reachable permanently from Settings, since
 * import merges and is idempotent."* Issue #75 — blocked on this one — is what wires the
 * first-run offer and the Settings door to this route; until it lands, this page is
 * reachable by its URL alone, and running it is exactly as safe either way.
 */

/**
 * Never prerendered — the same line `search/page.tsx` and `settings/page.tsx` both carry.
 * Reading the session reads cookies, which only makes this route dynamic *after* the
 * first attempt; without this, a build-time prerender resolves the database pool for a
 * page rendered for nobody.
 */
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  /**
   * The gate. `proxy.ts` turned away a reader with no cookie at all; this is the check
   * that queries the session table, and `tests/route-manifest.test.ts` is what proves this
   * route is behind the matcher — nothing new to write for it (issue #73's acceptance
   * criteria).
   */
  await requireUserId();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-text">Import</h1>

      <div className="mt-8 flex-1">
        <ImportSurface />
      </div>
    </main>
  );
}
