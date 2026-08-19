import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { requireDisplayName, requireTimezone, requireUserId } from "@/lib/session";
import { DisplayNameControl } from "./display-name-control";
import { SignOutButton } from "./sign-out-button";
import { SignOutOtherDevicesButton } from "./sign-out-other-devices-button";
import { TimezoneControl } from "./timezone-control";

/**
 * Settings, with **all three sections now real**.
 *
 * `SPEC.md` §7 gives Settings three sections — Profile, Data and Account (#28). Profile
 * carries the display name (issue #123) and, now, the timezone control (issue #126) that
 * same table row named from the start. Data ships with *Import a library ›* (issue #75),
 * and Account ships with sign-out and sign-out other devices (issue #124). None of the
 * three is a stub: each is complete as far as its own build step goes.
 *
 * ── Why sign-out lives here rather than in the masthead ──────────────────────────────
 *
 * The alternative was a throwaway control in the masthead, which #11 rejected as an
 * avatar menu and #28 kept rejected. A control invented to be replaced is a control that
 * has to be found and removed later, and this way the route it will live on for the rest
 * of the product's life exists from the first day there is anything to put on it.
 *
 * ── Data links to `/import` unconditionally ───────────────────────────────────────────
 *
 * *The permanent door once first run is past* (`SPEC.md` §7) — but this link does not
 * check whether first run is past, and should not: `/import` is reachable directly by URL
 * regardless (`app/(signed-in)/import/page.tsx`), so hiding the link behind the offer
 * being answered would only make the door harder to find for exactly nobody's benefit. The
 * acceptance criterion is explicit — *works whether or not the offer was ever declined.*
 *
 * ── What is not here ─────────────────────────────────────────────────────────────────
 *
 * *Delete account* is the remaining third of the Account section, its own page rather
 * than a dialog per `SPEC.md` §7, and it is still build step 7 (`SPEC.md` §8).
 */

/**
 * Never prerendered, and said out loud rather than left to inference.
 *
 * Reading the session reads cookies, which makes this dynamic on its own — but only
 * *after* the attempt. Without this line `next build` starts a prerender of this route,
 * calls `requireUserId()`, and resolves the pool: with no `DATABASE_URL` (CI) it prints a
 * connection error into the build log before falling back to dynamic, and with one
 * (Vercel production) it opens a real connection to the production database at build
 * time to render a page for nobody.
 *
 * It is also what keeps the response out of any cache that could serve it again without
 * asking. Measured rather than assumed, against both servers: `next start` answers a
 * dynamic route with `Cache-Control: private, no-cache, no-store, max-age=0,
 * must-revalidate`, and `next dev` with the weaker `no-cache, must-revalidate`. Either
 * way a back navigation has to revalidate rather than replay, and production does not
 * store it at all.
 *
 * That is one of the two things standing between a sign-out and the back button returning
 * this page. The other is `router.refresh()` in `sign-out-button.tsx`, which empties the
 * client-side Router Cache — a cache that lives in the running page and that no HTTP
 * header reaches.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  /**
   * The gate, and a reader with no session is sent to sign-in from here rather than
   * shown an empty Settings — see `lib/session.ts` on why that is a redirect and not a
   * thrown read failure.
   *
   * The id itself is still unused: nothing on this page reads a database row, the
   * display name and timezone included — `requireDisplayName()` and `requireTimezone()`
   * below both read straight off the session Better Auth already resolved, the same
   * shape `requireImportOfferAnswered()` takes elsewhere. Calling this is what makes the
   * route protected today, and `tests/route-manifest.test.ts` is what proves it stays
   * that way.
   */
  await requireUserId();
  const name = await requireDisplayName();
  const timezone = await requireTimezone();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-stock">Settings</h1>

      <section aria-labelledby="profile-h" className="mt-12 border-t border-rule pt-6">
        <h2 id="profile-h" className="code-line text-stock-dim">
          Profile
        </h2>

        <div className="mt-6">
          <DisplayNameControl name={name} />
        </div>

        <TimezoneControl timezone={timezone} />
      </section>

      <section aria-labelledby="data-h" className="mt-12 border-t border-rule pt-6">
        <h2 id="data-h" className="code-line text-stock-dim">
          Data
        </h2>

        <p className="mt-4 max-w-[60ch] text-note leading-relaxed text-stock-dim">
          Bring in titles and watches from an export file. It only ever adds — running the
          same file twice changes nothing the second time.
        </p>

        <div className="mt-6">
          <Link href="/import" className={GHOST_RECOVERY}>
            Import a library ›
          </Link>
        </div>
      </section>

      <section aria-labelledby="account-h" className="mt-12 border-t border-rule pt-6">
        <h2 id="account-h" className="code-line text-stock-dim">
          Account
        </h2>

        <p className="mt-4 max-w-[60ch] text-note leading-relaxed text-stock-dim">
          Signing out ends this session on this device. Your library, your watches and
          your ratings are kept, and signing back in with the same Google account returns
          you to all of them.
        </p>

        <div className="mt-6">
          <SignOutButton />
        </div>

        <p className="mt-8 max-w-[60ch] text-note leading-relaxed text-stock-dim">
          Ends every other session signed in as you — a phone sold, lost or lent, or a
          browser you signed into somewhere else. This device stays signed in.
        </p>

        <div className="mt-6">
          <SignOutOtherDevicesButton />
        </div>
      </section>
    </main>
  );
}
