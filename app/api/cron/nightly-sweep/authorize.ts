import type { NextRequest } from "next/server";

/**
 * The cron route's own bearer check, split out from `route.ts` for the same reason
 * `run-sweep.ts` is: `route.ts` imports `@/tmdb/catalogue`, which is `import "server-only"`
 * — a hard throw under plain Node module resolution — so a test importing `route.ts` at
 * all could never run under Vitest. This file imports only `next/server`'s types, so
 * `tests/nightly-sweep-route.test.ts` can exercise the actual check rather than a
 * reimplementation of it.
 */

/**
 * Whether `request` is missing the bearer `CRON_SECRET` this route requires.
 *
 * `!configured` also rejects — loud rather than "works accidentally" if `CRON_SECRET` is
 * ever unset in an environment this route is reachable from. That is what makes "it checks
 * a bearer `CRON_SECRET` itself and rejects anything without it" (issue #115) true even of
 * a misconfigured deploy: no secret configured means no request can pass, not every
 * request passing.
 */
export function unauthorized(request: NextRequest): boolean {
  const configured = process.env.CRON_SECRET;
  return !configured || request.headers.get("authorization") !== `Bearer ${configured}`;
}
