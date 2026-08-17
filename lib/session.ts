import type { UserId } from "@/db/access";

/**
 * The one boundary where a session becomes a user id.
 *
 * Everything downstream of here — every function in `db/access.ts`, every server action,
 * every route handler — takes the user id as an argument. This module is the only place
 * that asks who is asking, and the only place that will ever call Better Auth's
 * `auth.api.getSession()`.
 *
 * One place, because "who is this" answered in two places is two answers. A read that
 * resolves its own session is also a read that cannot be called for anyone else, which
 * makes it untestable and makes the import and the nightly refresh — neither of which
 * has a session at all — impossible to write without a second path to the same rows.
 *
 * ── Not built yet ────────────────────────────────────────────────────────────────────
 *
 * Sign-in is issue #42. Until it lands there is no session to resolve, and this throws
 * rather than inventing one. It does **not** return a placeholder user id: a fake
 * identity that works is exactly how a development-only path survives into production,
 * and constraint 1 — one data path — is the reason this rewrite exists.
 *
 * What #42 replaces this body with, and nothing more:
 *
 * ```ts
 * const session = await auth.api.getSession({ headers: await headers() });
 * if (!session) redirect("/sign-in");
 * return asUserId(session.user.id);
 * ```
 *
 * That `asUserId` is the only honest cast in the codebase: `UserId` is branded so it
 * cannot be confused with the other strings around it, and this is the one place a real
 * one is minted.
 *
 * Route protection is issue #43's middleware matcher over the route manifest, so by the
 * time a page calls this, an unauthenticated request should already have been turned
 * away. This still throws rather than trusting that: the matcher is the gate, and this
 * is the assertion that the gate held.
 */
export async function requireUserId(): Promise<UserId> {
  throw new Error(
    "No session to resolve: sign-in is not built yet (issue #42). " +
      "lib/session.ts is the one place that resolves one, and nothing may work around it.",
  );
}
