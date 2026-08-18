import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auth as cliEntry } from "@/auth.config";
import { user } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { TIMEZONE_FALLBACK } from "@/lib/timezone";

/**
 * The auth configuration, asserted as data.
 *
 * Everything here is a promise `lib/auth.ts` makes in prose, turned into something that
 * fails. `authOptions` is plain data with no side effects, which is what makes this
 * testable at all — the instance itself resolves a pool, and `getDb()` throws under
 * vitest by design.
 *
 * This is also the object the Better Auth CLI reads when it regenerates
 * `auth-schema.ts`. Asserting the same object the generator was pointed at is the point:
 * a claim about the schema that cannot be true of the config and false of the file.
 */
describe("what the auth configuration commits to", () => {
  it("is the same object the schema generator reads", () => {
    // If these ever stop being the same object, every assertion below stops saying
    // anything about the generated schema — it would be asserting one config while the
    // CLI regenerated from another.
    expect(cliEntry.options).toBe(authOptions);
  });

  describe("Google, and nothing else", () => {
    it("offers exactly one provider", () => {
      expect(Object.keys(authOptions.socialProviders)).toEqual(["google"]);
    });

    it("has email and password turned off in writing", () => {
      // Written out rather than defaulted, so that turning it on is a visible diff and
      // not an absence nobody notices. SPEC.md §6 and issue #8.
      expect(authOptions.emailAndPassword.enabled).toBe(false);
    });

    it("configures no magic link, no passkey and no one-time password", () => {
      // The plugin array is the only place another sign-in method can arrive from.
      const pluginIds = authOptions.plugins.map((plugin) => plugin.id);
      expect(pluginIds).toEqual(["next-cookies"]);
    });
  });

  describe("user.timezone", () => {
    it("is declared as an additionalFields entry", () => {
      // The acceptance criterion in issue #42, and the reason it is worded that way:
      // `auth-schema.ts` is overwritten whole by the CLI, so a column hand-patched into
      // it lives until the next regeneration and is then dropped by the migration after
      // that. Declared here, regeneration reproduces it.
      expect(authOptions.user.additionalFields.timezone).toMatchObject({
        type: "string",
        required: true,
        defaultValue: TIMEZONE_FALLBACK,
        input: false,
      });
    });

    it("survived regeneration into the schema drizzle-kit reads", () => {
      // The other half of the same criterion. The assertion is against `db/schema.ts`,
      // which is what `drizzle-kit generate` diffs and therefore what actually reaches
      // Postgres — not against the config that asked for it.
      const columns = getTableColumns(user);

      expect(columns.timezone).toBeDefined();
      expect(columns.timezone.name).toBe("timezone");
      expect(columns.timezone.notNull).toBe(true);
      expect(columns.timezone.default).toBe(TIMEZONE_FALLBACK);
    });

    it("is not something a client may set", () => {
      // `input: false`. The zone comes from the cookie the sign-in control wrote, through
      // the create hook — never from a request body, where anyone could put anything.
      expect(authOptions.user.additionalFields.timezone.input).toBe(false);
    });
  });

  describe("user.importOfferAnsweredAt", () => {
    it("is declared as an additionalFields entry", () => {
      // Issue #70. Unlike timezone, absence is a meaningful state — the offer has not
      // been answered — so there is no `defaultValue` and `required` is `false`.
      expect(authOptions.user.additionalFields.importOfferAnsweredAt).toMatchObject({
        type: "date",
        required: false,
        input: false,
      });
    });

    it("survived regeneration into the schema drizzle-kit reads", () => {
      const columns = getTableColumns(user);

      expect(columns.importOfferAnsweredAt).toBeDefined();
      expect(columns.importOfferAnsweredAt.name).toBe("import_offer_answered_at");
      expect(columns.importOfferAnsweredAt.notNull).toBe(false);
    });

    it("is not something a client may set", () => {
      expect(authOptions.user.additionalFields.importOfferAnsweredAt.input).toBe(false);
    });
  });

  describe("sessions", () => {
    it("slides for about a year", () => {
      const oneYear = 60 * 60 * 24 * 365;
      expect(authOptions.session.expiresIn).toBe(oneYear);
      // Sliding rather than fixed: without `updateAge` the year is a hard year and every
      // account is signed out on the same anniversary.
      expect(authOptions.session.updateAge).toBeLessThan(oneYear);
    });

    it("is never answered from a cookie cache", () => {
      // This is what makes "sign-out revokes the session server-side" true rather than
      // nearly true. With the cache on, a copied cookie keeps validating for the length
      // of the cache after the row is gone.
      expect(authOptions.session.cookieCache.enabled).toBe(false);
    });

    /**
     * The session cookie keeps Better Auth's default name, and `proxy.ts` depends on it.
     *
     * `carriesSessionCookie()` asks `getSessionCookie()` for the cookie without passing a
     * prefix, so it looks for `better-auth.session_token` — the default. Setting
     * `advanced.cookiePrefix` here would rename the cookie the browser is given and leave
     * the gate looking for the old name, at which point every signed-in request reads as
     * signed-out and bounces to sign-in, which sends it back to `/`, which bounces it
     * again. A redirect loop, from one property nobody would connect to it.
     *
     * So the two are pinned together here rather than left to agree by luck. If a prefix
     * is ever wanted, `lib/session-cookie.ts` is what has to be told about it.
     */
    it("leaves the session cookie its default name, which proxy.ts looks for", () => {
      expect(authOptions).not.toHaveProperty("advanced.cookiePrefix");
      expect(authOptions).not.toHaveProperty("advanced.cookies.session_token");
    });
  });

  it("rate limits, in Postgres, everywhere rather than only in production", () => {
    expect(authOptions.rateLimit.enabled).toBe(true);
    expect(authOptions.rateLimit.storage).toBe("database");
  });
});

/**
 * *There is no password field, no magic link and no email field anywhere in the system.*
 *
 * The configuration assertions above close the server half — no provider can issue a
 * credential nobody configured. This closes the other half, the one a future ticket could
 * reopen by accident: a field on a page.
 *
 * It is a static scan rather than a render, in the same spirit as SPEC.md §6's static
 * route-manifest check: the constraint is machine-checked rather than remembered, and it
 * costs no renderer, no jsdom and no test database. It reads the source because that is
 * where the mistake would be written.
 */
const SOURCE_ROOTS = ["app", "errors", "lib"];

const FORBIDDEN_INPUTS = [
  { pattern: /type\s*=\s*["'{]?\s*password/i, what: "a password field" },
  { pattern: /type\s*=\s*["'{]?\s*email/i, what: "an email field" },
  { pattern: /autoComplete\s*=\s*["'{]?\s*(?:email|[a-z-]*password)/i, what: "a credential field" },
  { pattern: /signIn\.magicLink|magicLink\(/i, what: "a magic link" },
];

function sourceFiles(root: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(full)) found.push(full);
  }

  return found;
}

describe("no credential field reaches a page", () => {
  const files = SOURCE_ROOTS.flatMap(sourceFiles);

  it("finds source to scan, so a passing scan means something", () => {
    // Without this, a renamed directory turns the whole block below into a scan of
    // nothing that passes forever.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN_INPUTS)("renders no $what", ({ pattern }) => {
    const offenders = files.filter((file) =>
      pattern.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
