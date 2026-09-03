import type { FixtureSession } from "./fixture-session";

/**
 * `FixtureSession`'s cookie, in the shape Playwright's `storageState` file wants it —
 * factored out of `global-setup.ts` so issue #305's specs can mint a *second* fixture
 * account of their own and write it to their own `storageState` file, without copying
 * the shape by hand a second time.
 *
 * ── Why a second account, rather than seeding rows onto the shared one ───────────────
 *
 * `pending-hold.spec.ts` depends on the one fixture account `global-setup.ts` seeds
 * carrying **no** library entries — its whole test reads `/library` down to
 * `EmptyLibrary`. The two morph tests need the opposite: a title actually in the
 * library and actually on Up next. Writing rows onto the shared account would make one
 * file's fixture the next file's bug, so `poster-morph.spec.ts` seeds and signs in as
 * its own account instead, through this same shape.
 */
export function toStorageState(session: FixtureSession): {
  cookies: unknown[];
  origins: unknown[];
} {
  return {
    cookies: [
      {
        name: session.cookie.name,
        value: session.cookie.value,
        domain: "localhost",
        path: session.cookie.path,
        expires: session.cookie.expires,
        httpOnly: session.cookie.httpOnly,
        secure: session.cookie.secure,
        sameSite: session.cookie.sameSite,
      },
    ],
    origins: [],
  };
}
