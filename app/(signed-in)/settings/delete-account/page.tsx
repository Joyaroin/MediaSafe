import { DestroyedFigure } from "@/app/destroyed-figure";
import { accountFootprint } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { BackToSettings, DeleteAccountHeading } from "./delete-account-frame";
import { DeleteAccountForm } from "./delete-account-form";

/**
 * The door out — `SPEC.md` §7, build step 7, issue #125.
 *
 * ── Its own route, and that is the design ────────────────────────────────────────────
 *
 * `SPEC.md` §7 says *its own page, not a dialog*, and the difference is what a reader does
 * to escape one: **a dialog is dismissed; a page is left.** A dialog also has nowhere to
 * put the three numbers below without becoming a page with a shadow behind it.
 *
 * There is a public sign-up, so accounts other than Adham's can exist, and an account with
 * no way out is a product that keeps your data because you cannot make it stop.
 *
 * ── The numbers are the point ────────────────────────────────────────────────────────
 *
 * Counted from the database at page load, for this account. Not *your data*, not
 * *everything*: 472 titles and 18,715 watches is a different decision from 3 and 11, and
 * only the reader can tell which one they are making. They sit **above** the confirmation
 * field, which is the whole mitigation for the confirmation word being a fixed one rather
 * than this account's own name — see `confirmation.ts`.
 *
 * ── A count that cannot be read is a read failure, never a zero ──────────────────────
 *
 * There is no `try` around `accountFootprint` and there must never be one. `AGENTS.md`
 * holds this everywhere; here it is the difference between *you have nothing to lose* and
 * *MediaSafe could not tell you what you are about to lose*, on the one screen in the
 * product where acting on the wrong one cannot be undone. A failed count throws,
 * `error.tsx` beside this file catches it, and what the reader gets is a read failure with
 * **no confirmation field under it** — the page cannot offer to delete what it could not
 * count.
 *
 * ── Visiting does nothing. Leaving does nothing ──────────────────────────────────────
 *
 * This function reads. It writes nothing, it has no side effect, and there is no
 * `useEffect` anywhere in the route. The account is destroyed by one path only: an armed
 * submit calling `deleteAccountAction`.
 */

/**
 * Never prerendered, for the reasons `../page.tsx` sets out at length: reading the session
 * makes this dynamic anyway, but only after the attempt, and without this line `next build`
 * starts a prerender that resolves the pool — a connection error in CI's log, and a real
 * connection to the production database at build time on Vercel.
 *
 * It matters more here than there. This page renders three counts of an account's rows,
 * and it is the one page in the application whose response must never be sitting in a
 * cache where a back navigation could replay it after the account it described is gone.
 */
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const userId = await requireUserId();
  const footprint = await accountFootprint(userId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <DeleteAccountHeading />

      <p className="mt-8 max-w-[62ch] text-note leading-relaxed text-text">
        This destroys everything MediaSafe holds about you. It happens immediately and it
        cannot be undone — there is no grace period, nothing is kept, and there is nothing
        to restore from.
      </p>

      <section aria-labelledby="destroyed-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="destroyed-h" className="code-line text-dim">
          What this destroys
        </h2>

        {/*
          A description list, laid out `flex-col-reverse` so each number reads above its
          label while `dt` still precedes `dd` in the markup. `flex-wrap` with a row gap is
          what makes three figures across a desktop become one or two per row on a phone
          without a breakpoint deciding it.
        */}
        <dl className="mt-6 flex flex-wrap gap-x-16 gap-y-8">
          <DestroyedFigure label="Titles" count={footprint.titles} />
          <DestroyedFigure label="Watches" count={footprint.watches} />
          <DestroyedFigure label="Ratings" count={footprint.ratings} />
        </dl>

        <p className="mt-8 max-w-[62ch] text-note leading-relaxed text-dim">
          Titles counts what is in your library, not the catalogue MediaSafe shares between
          accounts — what is destroyed is your shelf, every watch you have recorded and
          every rating you have given. Signing in again with the same Google account makes
          a new, empty account. It does not bring any of this back.
        </p>
      </section>

      <section aria-labelledby="google-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="google-h" className="code-line text-dim">
          Google
        </h2>

        {/*
          Stated because without it *delete account* over-promises: the reader believes
          every trace is gone while their Google account still lists MediaSafe under
          connected apps. Revoking the grant programmatically was rejected — an outbound
          call that can fail in the middle of an irreversible operation, and a half-failed
          deletion is worse than an honest sentence. Deleting the account makes no outbound
          call at all; this link is the reader's own, taken in their own time.
        */}
        <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-dim">
          Deleting your account here does not remove MediaSafe from your Google account. It
          stays listed under your connected apps until you remove it there.{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
            className="text-text underline decoration-hair underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:decoration-accent"
          >
            Your Google connected apps ›
          </a>
        </p>
      </section>

      <section aria-labelledby="confirm-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="confirm-h" className="code-line text-dim">
          Confirm
        </h2>

        <div className="mt-6">
          <DeleteAccountForm />
        </div>

        <BackToSettings />
      </section>
    </main>
  );
}
