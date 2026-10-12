import { redirect } from "next/navigation";

import { isSignedIn } from "@/lib/session";
import { PosterFrames } from "../poster-frames";
import { Wordmark } from "../press-mark";
import { SignInSurface } from "./sign-in-surface";

/**
 * The one route in the application that a signed-out reader may reach.
 *
 * ── No masthead ──────────────────────────────────────────────────────────────────────
 *
 * The masthead is present at every width, and it is — on every signed-in
 * surface. It is not here, and the reason is that its only control is the Settings
 * entrance, which leads somewhere a signed-out reader cannot go. Reserved space and placeholder destinations are forbidden; a masthead on this page would be both.
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
   * is ours. The reader is allowed one technical string and this is not it.
   */
  const arrivedFailed = typeof error === "string" && error.length > 0;

  return (
    // Charcoal (handoff §8.10): the wordmark at the head, the frames picture in whatever
    // height is left, and the words and the one control anchored to the foot, where a
    // thumb is. Left-aligned like every other screen, in a phone-width column at any width.
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-gutter pb-9 pt-6">
      <Wordmark markClassName="h-6 w-6" nameClassName="text-row font-semibold leading-none" />

      <div className="flex flex-1 items-center py-8">
        <PosterFrames glyph="tick" />
      </div>

      <h1 className="screen-title text-screen text-text">
        A personal tracker for the films and shows you watch
      </h1>

      <p className="mt-3.5 text-note leading-relaxed text-dim">
        Sign in with Google to reach your library. MediaSafe has no password to remember
        and asks for nothing else — everything it knows about you comes from the account
        you choose.
      </p>

      <SignInSurface arrivedFailed={arrivedFailed} />
    </main>
  );
}
