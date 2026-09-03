import { randomBytes, randomUUID } from "node:crypto";

import { makeSignature } from "better-auth/crypto";
import { getCookies } from "better-auth/cookies";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import { authOptions } from "@/lib/auth";
import * as schema from "@/db/schema";

/**
 * Mints a seeded fixture account and a session Better Auth will accept, for the browser
 * harness issue #304 adds. Nothing here is reachable from application code — it lives
 * under `tests/`, which `eslint.config.mjs`'s data-access choke point exempts for the
 * same reason `tests/support/database.ts` is exempt: this has to open its own connection
 * and write Better Auth's own tables directly, which the application itself must never do.
 *
 * ── Why a row rather than a real sign-in ──────────────────────────────────────────────
 *
 * `SPEC.md` §6 names Google as the only sign-in method, and there is no test provider to
 * drive instead. So this writes the two rows a successful Google sign-in would have
 * written — `user`, `session` — and signs the cookie the same way `lib/auth.ts`'s Better
 * Auth instance would have: `${token}.${signature}`, HMAC-SHA256 over the raw token with
 * `BETTER_AUTH_SECRET`, matching `better-call`'s own `setSignedCookie` (verified by
 * reading `node_modules/better-call/dist/context.mjs` — the cookie is rejected unless the
 * signature is exactly this shape). `better-auth/crypto`'s `makeSignature` is Better
 * Auth's own export of that HMAC step, not a reimplementation of it.
 *
 * ── Why the offer is pre-answered ─────────────────────────────────────────────────────
 *
 * `/library` redirects to `/welcome` until `importOfferAnsweredAt` is set
 * (`lib/session.ts#requireImportOfferAnswered`, `app/(signed-in)/library/page.tsx`). The
 * harness is proving something about the pending state on a navigation between two
 * route-level boundaries, not about the first-run offer, so the fixture account answers
 * it up front the way a returning reader already has.
 */

export interface FixtureAccount {
  readonly userId: string;
  readonly email: string;
}

export interface FixtureSession extends FixtureAccount {
  /** The cookie name and value a signed-in browser carries — ready for Playwright's
   *  `storageState` shape. */
  readonly cookie: {
    readonly name: string;
    readonly value: string;
    readonly path: string;
    readonly httpOnly: boolean;
    readonly secure: boolean;
    readonly sameSite: "Strict" | "Lax" | "None";
    /** Unix seconds, matching Playwright's cookie shape. */
    readonly expires: number;
  };
}

/**
 * Writes a fresh account and a valid session for it, and returns the cookie that proves
 * the session — one connection, opened and closed here rather than through the
 * application's process-wide pool, since this runs as its own short-lived script outside
 * Next entirely.
 */
export async function seedFixtureSession(): Promise<FixtureSession> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const userId = `e2e-fixture-${randomUUID()}`;
    const email = `${userId}@example.test`;

    await db.insert(schema.user).values({
      id: userId,
      name: "Playwright Fixture",
      email,
      timezone: "UTC",
      importOfferAnsweredAt: new Date(),
    });

    const secret = requireBetterAuthSecret();
    const token = randomBytes(32).toString("hex");
    const signature = await makeSignature(token, secret);
    const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await db.insert(schema.session).values({
      id: randomUUID(),
      token,
      userId,
      expiresAt: sessionExpiresAt,
    });

    const { sessionToken } = getCookies(authOptions);

    return {
      userId,
      email,
      cookie: {
        name: sessionToken.name,
        value: `${token}.${signature}`,
        path: sessionToken.attributes.path ?? "/",
        httpOnly: sessionToken.attributes.httpOnly ?? true,
        secure: sessionToken.attributes.secure ?? false,
        sameSite: toPlaywrightSameSite(sessionToken.attributes.sameSite),
        expires: Math.floor(sessionExpiresAt.getTime() / 1000),
      },
    };
  } finally {
    await pool.end();
  }
}

function requireBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. The browser suite mints its own session and needs " +
        "the same secret the running app signs cookies with — see docs/local-development.md.",
    );
  }
  return secret;
}

function toPlaywrightSameSite(sameSite: string): "Strict" | "Lax" | "None" {
  const lower = sameSite.toLowerCase();
  if (lower === "strict") return "Strict";
  if (lower === "none") return "None";
  return "Lax";
}
