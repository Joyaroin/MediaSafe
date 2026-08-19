import { redirect } from "next/navigation";

import { requireImportOfferAnswered, requireUserId } from "@/lib/session";
import { WelcomeSurface } from "./welcome-surface";

/**
 * **Bring your library in** — the first real screen after first sign-in, and not the
 * empty library (`SPEC.md` §7, `docs/design/v1-surfaces.md` §4 screen 2, issue #75).
 *
 * Import is the default path and the empty library is the exception, so a first sign-in
 * lands here rather than on a library with nothing in it. It offers exactly two answers —
 * `WelcomeSurface`'s two buttons — and both are terminal: this screen is never returned to
 * on its own, only reached again by a reader who has not yet answered.
 *
 * ── One design, no `lg:` divergence ───────────────────────────────────────────────────
 *
 * The same "identical on both, low-frequency, no evidence the intent differs" argument
 * `app/(signed-in)/import/page.tsx` and `app/(signed-in)/settings/page.tsx` already make
 * for themselves — `SPEC.md` §7's four genuine divergences do not include this screen.
 */

/**
 * Never prerendered, for the reason every other signed-in route carries the same line:
 * reading the session reads cookies, which makes the route dynamic only *after* the
 * attempt — and without this, `next build` starts a prerender, calls `requireUserId()`,
 * and resolves the pool against whatever `DATABASE_URL` the build environment has.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  /** The gate. `tests/route-manifest.test.ts` is what proves this route is behind it. */
  await requireUserId();

  /**
   * *Somebody who has already answered is not offered this screen again* — the
   * acceptance criterion this line is. Reached only by a reader who typed the URL, used
   * the back button, or opened a second tab after answering in the first.
   */
  if (await requireImportOfferAnswered()) redirect("/library");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-text">Bring your library in</h1>

      <p className="mt-5 max-w-[62ch] text-note leading-relaxed text-dim">
        MediaSafe can bring in your whole library from an export file in one pass — every
        title and every watch — instead of adding titles one at a time. You can also start
        with an empty library and add titles as you go, from Search.
      </p>

      <div className="mt-8">
        <WelcomeSurface />
      </div>
    </main>
  );
}
