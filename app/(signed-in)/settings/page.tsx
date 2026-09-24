import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { requireDisplayName, requireTimezone, requireUserId } from "@/lib/session";
import { DisplayNameControl } from "./display-name-control";
import { NavTransition } from "../nav-transition";
import { SettingsHeading } from "./settings-heading";
import { SignOutButton } from "./sign-out-button";
import { SignOutOtherDevicesButton } from "./sign-out-other-devices-button";
import { ThemeControl } from "./theme-control";
import { TimezoneControl } from "./timezone-control";

/**
 * Settings, with **all three sections now real**.
 *
 * Settings has three sections — Profile, Data and Account (#28). Profile
 * carries the display name (issue #123) and, now, the timezone control (issue #126) that
 * same table row named from the start. Data ships with *Import a library ›* (issue #75),
 * and Account ships with sign-out, sign-out other devices (issue #124) and the way out
 * altogether (issue #125). None of the three is a stub: each is complete as far as its own
 * build step goes — and with #125 the whole of that table is on the page.
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
 * *The permanent door once first run is past* — but this link does not
 * check whether first run is past, and should not: `/import` is reachable directly by URL
 * regardless (`app/(signed-in)/import/page.tsx`), so hiding the link behind the offer
 * being answered would only make the door harder to find for exactly nobody's benefit. The
 * acceptance criterion is explicit — *works whether or not the offer was ever declined.*
 *
 * ── Account gained its door out, and it is a link ────────────────────────────────────
 *
 * *Delete account* (issue #125) is here as one link, because it belongs on **its
 * own page, not a dialog** — a dialog is dismissed, a page is left. What Settings owes it
 * is a way to be found, which is a sentence and a link; everything that makes the decision
 * a real one — the three counts, the word to type, the sentence about Google — is on the
 * page itself, where a reader who arrived by URL sees it too.
 *
 * ── There is no longer a *what is not here* ──────────────────────────────────────────
 *
 * Every earlier version of this docblock carried one, and issue #125 is what empties it:
 * *Delete account* was the remaining third of the Account section and the last thing
 * build step 7 names. Nothing here is a heading with nothing under it,
 * which is forbidden — not because the rule was obeyed carefully, but because
 * there is nothing left to reserve space for.
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
    <NavTransition>
      <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
        <SettingsHeading />

        <section aria-labelledby="profile-h" className="mt-12 border-t border-hair pt-6">
          <h2 id="profile-h" className="code-line text-dim">
            Profile
          </h2>

          <div className="mt-6">
            <DisplayNameControl name={name} />
          </div>

          <TimezoneControl timezone={timezone} />

          {/* Appearance sits in Profile rather than in a fourth section, because the
              table gives Settings three and adding one would be a second spec change
              on top of the picker itself. It is the least bad home rather than an obvious
              one: unlike the display name and unlike the timezone, this is a **device**
              preference and never touches `user` (`lib/theme.ts`). The timezone is the
              neighbour that makes it bearable — that one is device-*detected* even though
              it is account-stored, so the section already mixes the two ideas. */}
          <ThemeControl />
        </section>

        <section aria-labelledby="data-h" className="mt-12 border-t border-hair pt-6">
          <h2 id="data-h" className="code-line text-dim">
            Data
          </h2>

          <p className="mt-4 max-w-[60ch] text-note leading-relaxed text-dim">
            Bring in titles and watches from an export file. It only ever adds — running the
            same file twice changes nothing the second time.
          </p>

          <div className="mt-6">
            <Link href="/import" className={GHOST_RECOVERY}>
              Import a library ›
            </Link>
          </div>
        </section>

        <section aria-labelledby="account-h" className="mt-12 border-t border-hair pt-6">
          <h2 id="account-h" className="code-line text-dim">
            Account
          </h2>

          <p className="mt-4 max-w-[60ch] text-note leading-relaxed text-dim">
            Signing out ends this session on this device. Your library, your watches and
            your ratings are kept, and signing back in with the same Google account returns
            you to all of them.
          </p>

          <div className="mt-6">
            <SignOutButton />
          </div>

          <p className="mt-8 max-w-[60ch] text-note leading-relaxed text-dim">
            Ends every other session signed in as you — a phone sold, lost or lent, or a
            browser you signed into somewhere else. This device stays signed in.
          </p>

          <div className="mt-6">
            <SignOutOtherDevicesButton />
          </div>

          {/*
            The door out (issue #125). A link and not a control: account
            deletion belongs on **its own page, not a dialog**, so the thing that belongs in this
            section is the way to that page and nothing else. Nothing is destroyed by
            following it — the page states what would be, in real numbers, and refuses to do
            anything until the reader types the word.

            Set apart from the two sign-outs above by its own rule rather than by colour.
            Vermilion here would be the section shouting before the reader has asked it
            anything, and `accent` is kept for a live state or a recorded mark; the
            page it leads to is where that accent belongs.
          */}
          <div className="mt-8 border-t border-hair pt-6">
            <p className="max-w-[60ch] text-note leading-relaxed text-dim">
              Deleting your account destroys your library, your watches and your ratings
              permanently. The next page says how many of each, and nothing happens until you
              confirm it there.
            </p>

            {/* Issue #195: matches `Import a library ›` above — `GHOST_RECOVERY`, keeping
                its chevron, in a plain `div` rather than the old underlined-prose `p`. */}
            <div className="mt-6">
              <Link href="/settings/delete-account" className={GHOST_RECOVERY}>
                Delete account ›
              </Link>
            </div>
          </div>
        </section>
      </main>
    </NavTransition>
  );
}
