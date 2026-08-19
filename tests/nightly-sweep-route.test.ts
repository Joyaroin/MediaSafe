import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { unauthorized } from "@/app/api/cron/nightly-sweep/authorize";

/**
 * The cron route's own bearer check (issue #115) — the acceptance criterion
 * `tests/nightly-sweep.test.ts` cannot cover, because it exercises `runNightlySweep`
 * directly rather than the HTTP wrapper around it.
 *
 * `unauthorized()` is imported from `authorize.ts`, not `GET` from `route.ts` itself:
 * `route.ts` imports `@/tmdb/catalogue`, which is `import "server-only"` and throws under
 * plain Node module resolution, so it can never be imported from Vitest at all — the same
 * constraint `tmdb/mirror.ts` and `run-sweep.ts` already document for the identical reason.
 * A request carrying the right secret would, through `route.ts`'s `GET`, fall through to
 * `runNightlySweep(titleMirror)`, which reaches for the application pool (`db/client.ts`'s
 * `getDb()`) — deliberately unavailable under Vitest — and would call TMDB for real. The
 * success path is exactly `runNightlySweep`, already exercised at the Postgres harness in
 * `tests/nightly-sweep.test.ts`; this file is only the un-sessioned gate in front of it.
 */

const ROUTE_URL = "http://localhost/api/cron/nightly-sweep";
const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
});

function requestWith(authorization?: string): NextRequest {
  return new NextRequest(ROUTE_URL, {
    headers: authorization ? { authorization } : {},
  });
}

describe("unauthorized", () => {
  it("rejects a request with no authorization header at all", () => {
    process.env.CRON_SECRET = "test-secret";

    expect(unauthorized(requestWith())).toBe(true);
  });

  it("rejects a request carrying the wrong secret", () => {
    process.env.CRON_SECRET = "test-secret";

    expect(unauthorized(requestWith("Bearer wrong-secret"))).toBe(true);
  });

  it("rejects a request carrying the right secret with the wrong scheme", () => {
    process.env.CRON_SECRET = "test-secret";

    expect(unauthorized(requestWith("test-secret"))).toBe(true);
  });

  it("rejects every request when CRON_SECRET is not configured at all", () => {
    delete process.env.CRON_SECRET;

    // Un-sessioned must never mean unauthenticated-by-accident: with nothing configured
    // to check against, no bearer value can be the right one.
    expect(unauthorized(requestWith("Bearer anything"))).toBe(true);
  });

  it("accepts a request carrying exactly the configured secret", () => {
    process.env.CRON_SECRET = "test-secret";

    expect(unauthorized(requestWith("Bearer test-secret"))).toBe(false);
  });
});
