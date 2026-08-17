import { requireUserId } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

/**
 * Settings, with **one section, genuinely finished**.
 *
 * `SPEC.md` §7 gives Settings three sections — Profile, Data and Account (#28). This
 * ships Account, and Account ships with sign-out. That is not a stub and it is not
 * reserved space: it is one of the three, complete as far as build step 1 goes.
 *
 * ── Why sign-out lives here rather than in the masthead ──────────────────────────────
 *
 * The alternative was a throwaway control in the masthead, which #11 rejected as an
 * avatar menu and #28 kept rejected. A control invented to be replaced is a control that
 * has to be found and removed later, and this way the route it will live on for the rest
 * of the product's life exists from the first day there is anything to put on it.
 *
 * ── What is not here ─────────────────────────────────────────────────────────────────
 *
 * *Sign out other devices* and *Delete account* are the other two thirds of the Account
 * section and they are build step 7 (`SPEC.md` §8). Profile — the display name and the
 * timezone control — and Data — *Import a library ›* — are step 7 and step 3. None of
 * them appears here as a heading with nothing under it: `SPEC.md` §9 forbids reserving
 * the space, and a section that announces what it will one day contain is exactly that.
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
   * The gate, and the only line on this page that decides anything. A reader with no
   * session is sent to sign-in from here rather than shown an empty Settings — see
   * `lib/session.ts` on why that is a redirect and not a thrown read failure.
   *
   * The id is deliberately not used yet. Nothing on this page reads a row: the display
   * name is step 7 and the timezone control is step 7. Calling this anyway is what makes
   * the route protected today, and issue #43's static check is what will prove it stays
   * that way.
   */
  await requireUserId();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-stock">Settings</h1>

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
      </section>
    </main>
  );
}
