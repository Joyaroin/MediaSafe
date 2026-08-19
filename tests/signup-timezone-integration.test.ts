import type { Pool } from "@neondatabase/serverless";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { runWithEndpointContext } from "@better-auth/core/context";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { user } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import {
  SIGNUP_TIMEZONE_COOKIE,
  TIMEZONE_FALLBACK,
} from "@/lib/timezone";
import { createPool } from "@/db/driver";
import { setUpTestDatabase } from "./support/database";

/**
 * *A new account's timezone is defaulted from the browser at signup without asking.*
 *
 * `tests/signup-timezone.test.ts` proves the parser. `tests/auth-configuration.test.ts`
 * proves the column was asked for and generated. Neither proves the thing between them:
 * that **Better Auth actually honours what the create hook returns**, and writes it into
 * a column declared `input: false`.
 *
 * That is not a safe assumption. `input: false` exists precisely to stop a field being
 * set from outside, and the hook sets it from outside the request body — so a Better Auth
 * release that tightened one could silently start dropping the other. What would follow
 * is the quietest possible defect: every new account created with `UTC`, no error
 * anywhere, and nothing on screen to read it until build step 6 buckets somebody's year
 * into the wrong days.
 *
 * ── Why this builds its own instance ─────────────────────────────────────────────────
 *
 * `getAuth()` resolves the application pool, and `getDb()` throws under vitest by design
 * (`db/client.ts`). So this points **the same `authOptions` the application runs** at the
 * harness's scratch database instead. Only the connection differs; the hooks, the
 * additional field and the adapter configuration are the shipped ones.
 *
 * The context is supplied the way Better Auth supplies it in production — through
 * `runWithEndpointContext`, the AsyncLocalStorage its own endpoints run inside, which is
 * where `createWithHooks` reads it from. Passing a hand-made object to the hook instead
 * would test the hook against a caller that does not exist.
 */

const database = setUpTestDatabase("mediasafe_signup_timezone_test");

/**
 * Built by a function rather than typed by hand, because `betterAuth` is generic over the
 * options it is given: annotating this as `ReturnType<typeof betterAuth>` erases the
 * literal options type and the two stop being assignable.
 */
function buildAuth(against: Pool) {
  return betterAuth({
    ...authOptions,
    // The one substitution: the scratch database rather than the application pool.
    database: (options: BetterAuthOptions) =>
      drizzleAdapter(drizzle(against, { schema }), {
        provider: "pg",
        schema,
      })(options),
    // Better Auth refuses to start without one, and CI has no secret. Any value does:
    // nothing here signs or verifies anything.
    secret: "a-test-secret-that-is-long-enough-to-not-warn-0000",
  });
}

let pool: Pool;
let auth: ReturnType<typeof buildAuth>;

beforeAll(() => {
  pool = createPool(database.connectionString());
  auth = buildAuth(pool);
});

afterAll(async () => {
  await pool.end();
});

/** Creates an account the way the Google callback does, on a request carrying `cookie`. */
async function createAccountWithCookie(
  id: string,
  cookie: string | null,
): Promise<string> {
  const context = await auth.$context;

  /**
   * The cast is Better Auth's own generic variance and not a real mismatch: `$context` is
   * typed against the *literal* options object this instance was built from, while
   * `runWithEndpointContext` wants one typed against the general `BetterAuthOptions`.
   * They are the same value. Narrowed to this one argument rather than widened by typing
   * `context` loosely, so the `internalAdapter` call below keeps its real types.
   */
  const endpointContext = context as unknown as Parameters<
    typeof runWithEndpointContext
  >[0]["context"];

  await runWithEndpointContext(
    { context: endpointContext, headers: cookieHeaders(cookie) },
    () =>
      context.internalAdapter.createUser({
        id,
        name: "Someone",
        email: `${id}@example.test`,
        emailVerified: true,
      }),
  );

  const [created] = await drizzle(pool, { schema })
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, id));

  return created.timezone;
}

function cookieHeaders(cookie: string | null): Headers {
  const headers = new Headers();
  if (cookie !== null) headers.set("cookie", cookie);
  return headers;
}

describe("the zone a new account is actually created with", () => {
  it("takes the zone the browser wrote on its way out to Google", async () => {
    const stored = await createAccountWithCookie(
      "signup-with-zone",
      `${SIGNUP_TIMEZONE_COOKIE}=Europe%2FLondon`,
    );

    // The whole point. If Better Auth ever stops honouring the hook's return value for
    // this field — regardless of `input`, which issue #126 flips to `true` so Settings'
    // control can reach it after signup — this is the line that says so.
    expect(stored).toBe("Europe/London");
  });

  it("falls back when the request carried no zone", async () => {
    const stored = await createAccountWithCookie("signup-no-cookie", null);

    expect(stored).toBe(TIMEZONE_FALLBACK);
  });

  it("falls back rather than storing something Postgres cannot resolve", async () => {
    const stored = await createAccountWithCookie(
      "signup-bad-zone",
      `${SIGNUP_TIMEZONE_COOKIE}=Mars%2FOlympus_Mons`,
    );

    expect(stored).toBe(TIMEZONE_FALLBACK);
  });

  it("asked nobody anything to get there", () => {
    // The other half of the acceptance criterion — *without asking*. There is no
    // endpoint, no prompt and no field at signup: every account above was created
    // from a cookie header and nothing else, and the OAuth callback that creates it
    // carries no body a reader could have filled in either way. `input` flipping to
    // `true` (issue #126) is what lets *build step 7's control* — Settings, after
    // signup — reach this field through `authClient.updateUser`; it does not open a
    // second door at signup, because signup never reads a body for this field at all.
    expect(authOptions.user.additionalFields.timezone.input).toBe(true);
  });
});
