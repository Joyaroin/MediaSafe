import { redirect } from "next/navigation";

import { isSignedIn } from "@/lib/session";
import { Wordmark } from "../press-mark";
import { SignInSurface } from "./sign-in-surface";

/**
 * The one route in the application that a signed-out reader may reach.
 *
 * ── No masthead ──────────────────────────────────────────────────────────────────────
 *
 * `DESIGN.md` says the masthead is present at every width, and it is — on every signed-in
 * surface. It is not here, and the reason is that its only control is the Settings
 * entrance, which leads somewhere a signed-out reader cannot go. `SPEC.md` §9 forbids
 * reserved space and placeholder destinations; a masthead on this page would be both.
 * What this page needs from the masthead is the press mark and the wordmark, so it
 * carries those itself.
 *
 * ── Never prerendered ────────────────────────────────────────────────────────────────
 *
 * Reading the session reads cookies, so this route is dynamic whether or not anything
 * says so. That is what makes the redirect below correct for every reader rather than
 * for whoever the build happened to be.
 */

/**
 * Never prerendered. Reading the session reads cookies and resolves the pool, and a build
 * that started that would either print a connection error into CI's log or open a real
 * connection to the production database — see the same note on the Settings route.
 */
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /**
   * *Someone already signed in who reaches the sign-in route is taken past it.*
   *
   * Past it, to `/`, rather than to a second sign-in they do not need. This is the one
   * caller of `isSignedIn()` and there should never be a second — see `lib/session.ts`.
   */
  if (await isSignedIn()) redirect("/");

  const { error } = await searchParams;

  /**
   * **Whether**, not what. Better Auth puts a machine-readable code here and Google
   * sometimes adds an `error_description` of its own; neither is a sentence and neither
   * is ours. `SPEC.md` §6 allows the reader one technical string and this is not it.
   */
  const arrivedFailed = typeof error === "string" && error.length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <Wordmark markClassName="h-6 w-6" />

      <h1 className="bill-title mt-8 text-bill-lg text-text">
        A personal tracker for the films and shows you watch
      </h1>

      <p className="mt-5 max-w-[62ch] text-note leading-relaxed text-dim">
        Sign in with Google to reach your library. MediaSafe has no password to remember
        and asks for nothing else — everything it knows about you comes from the account
        you choose.
      </p>

      <SignInSurface arrivedFailed={arrivedFailed} />
    </main>
  );
}
