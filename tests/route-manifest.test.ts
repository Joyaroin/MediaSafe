import { describe, expect, it } from "vitest";

import { config } from "@/proxy";
import {
  auditRouteProtection,
  matcherRunsOn,
  probeUrlFor,
  readBuildArtifacts,
} from "./support/route-manifest";

/**
 * **Test 2 of the four in `SPEC.md` §6**, and the machine behind constraint 5: *no
 * unauthenticated route may ever be added*.
 *
 * It compares two files `next build` wrote — the route manifest and the compiled proxy
 * matcher — and asserts that the second covers the first. There is no server here, no
 * browser and no database, because the property is about which routes exist and which
 * ones the gate runs on, and both of those are known before anything starts.
 *
 * `SPEC.md` §10.4 records that the original reason for the rule is gone: previews no
 * longer carry a copy of the real library. The rule stayed. This file is what will be
 * enforcing it in six months, when the reason is the only thing anybody remembers.
 *
 * **What it does not check**, said plainly so nobody reads more into a green run than is
 * there: it cannot see whether a page body calls `requireUserId()`, and the gate it checks
 * tests for a cookie's presence rather than its validity (`proxy.ts`). The property proved
 * here is that no route in the build can be reached with no session cookie at all.
 */

/**
 * **The three exemptions, named.**
 *
 * Everything else in the build must be behind the matcher. Adding a route to this list is
 * the visible diff issue #43 asks for — a line in a pull request with a name on it,
 * rather than two characters appended to a regular expression where nobody looks.
 *
 * They are written as the manifest writes them, brackets and all, because that is what
 * they are compared against.
 */
const EXEMPT = [
  /** The one route a signed-out reader may reach. */
  "/sign-in",
  /**
   * Better Auth's own endpoints. The Google callback is under here and it runs *before*
   * there is a session to check, so gating it would make signing in impossible.
   */
  "/api/auth/[...all]",
  /**
   * The nightly metadata sweep (issue #115). Vercel's cron sends no session cookie, so
   * this route is un-sessioned — **not unauthenticated**: it checks a bearer
   * `CRON_SECRET` itself and rejects anything without it
   * (`app/api/cron/nightly-sweep/route.ts`).
   */
  "/api/cron/nightly-sweep",
] as const;

describe("every route is behind the proxy matcher", () => {
  const built = readBuildArtifacts(process.cwd());

  /**
   * The source and the build agree — which is to say, **this build is this source**.
   *
   * Every other assertion below reads `.next`, and `.next` is whatever was built last. A
   * matcher edited and not rebuilt is checked in its old form, passes, and the pull
   * request looks green for a gate nobody compiled. This is the one assertion that
   * notices, and it is why the CI step depends on *Build* rather than only on *Install*.
   */
  it("compiles the matcher that proxy.ts writes", () => {
    expect(built.matcher).toEqual(config.matcher);
  });

  it("covers every route in the build except the three named above", () => {
    const audit = auditRouteProtection(built, EXEMPT);

    // Three separate assertions rather than one on the whole object, so a failure names
    // which of the three mistakes was made rather than printing a diff of all of them.
    expect(audit.unprotected).toEqual([]);
    expect(audit.notActuallyExempt).toEqual([]);
    expect(audit.stale).toEqual([]);
  });

  /**
   * The `_next/` clause in the matcher is an exclusion, not a fourth exemption, and this
   * is the assertion that keeps it one.
   *
   * It is there so the gate does not redirect the sign-in page's own JavaScript to the
   * sign-in page. It is defensible only while nothing routable lives under that prefix —
   * so rather than leaving that in a comment in `proxy.ts`, it is checked here against the
   * manifest, and the day a route appears under `/_next` this fails instead of hiding it.
   */
  it("excludes only the build output, which is no route at all", () => {
    expect(built.routes.filter((route) => route.startsWith("/_next"))).toEqual([]);
    expect(matcherRunsOn(built.matcher, "/_next/static/chunks/main.js")).toBe(false);
    expect(matcherRunsOn(built.matcher, "/_next/image")).toBe(false);
  });

  /**
   * The exemptions are anchored, so a route added under one of their prefixes is covered
   * rather than quietly inheriting the exemption. None of these paths exists today; the
   * point is what happens on the day one of them does.
   */
  it("does not extend any exemption to its neighbours", () => {
    expect(matcherRunsOn(built.matcher, "/sign-in/help")).toBe(true);
    expect(matcherRunsOn(built.matcher, "/sign-instead")).toBe(true);
    expect(matcherRunsOn(built.matcher, "/api/authorize")).toBe(true);
    // `api/cron/nightly-sweep$`, not `(?:$|/)`: unlike `api/auth`, this route has no
    // sub-paths, so nothing under it should inherit the exemption.
    expect(matcherRunsOn(built.matcher, "/api/cron/nightly-sweep/extra")).toBe(true);
  });

  /**
   * The assumption `matcherRunsOn` makes, checked where it is made.
   *
   * It asks Next's matcher with an empty `nextConfig`, which is the same question the
   * server asks only while there is no `basePath` and no rewrite. Add either and every
   * answer above quietly starts being about a different application than the one running.
   */
  it("routes on the terms the matcher was asked about", () => {
    expect(built.assumptions.basePath).toBe("");
    expect(built.assumptions.rewriteCount).toBe(0);
  });
});

/**
 * **The check can fail.** A test that has only ever been green is a test nobody has seen
 * work, and this one guards a property that will be checked long after everyone has
 * forgotten it is here.
 *
 * These run the same audit against manifests that were never built, so the failure is
 * permanent evidence rather than something proved once by hand and then removed. It was
 * also proved the other way, against a real build: a route added under a widened matcher
 * fails the audit above with the route named.
 */
describe("the check fails when the gate is widened", () => {
  it("reports a route the matcher was widened to skip", () => {
    const audit = auditRouteProtection(
      {
        routes: ["/", "/sign-in", "/reports"],
        matcher: ["/((?!_next/|sign-in$|reports$).*)"],
      },
      EXEMPT,
    );

    expect(audit.unprotected).toEqual(["/reports"]);
  });

  it("reports a route added under an exempt prefix", () => {
    const audit = auditRouteProtection(
      {
        routes: ["/", "/sign-in", "/api/auth/[...all]", "/api/auth/debug"],
        matcher: ["/((?!_next/|sign-in$|api/auth(?:$|/)).*)"],
      },
      EXEMPT,
    );

    expect(audit.unprotected).toEqual(["/api/auth/debug"]);
  });

  it("reports an exemption that is not one", () => {
    const audit = auditRouteProtection(
      // No exemptions at all: the matcher runs on `/sign-in` too.
      { routes: ["/", "/sign-in"], matcher: ["/(.*)"] },
      EXEMPT,
    );

    expect(audit.notActuallyExempt).toEqual(["/sign-in"]);
  });

  it("reports an exemption left behind by a deleted route", () => {
    const audit = auditRouteProtection(
      {
        // The cron route is still here, so only the deleted auth route goes stale —
        // this fixture isolates one leftover exemption rather than two.
        routes: ["/", "/sign-in", "/api/cron/nightly-sweep"],
        matcher: [
          "/((?!_next/|sign-in$|api/auth(?:$|/)|api/cron/nightly-sweep$).*)",
        ],
      },
      EXEMPT,
    );

    expect(audit.stale).toEqual(["/api/auth/[...all]"]);
  });

  /**
   * A route shape this check cannot turn into a URL throws rather than being probed as a
   * literal `@slot`, which would be a matcher answer about a path nobody can request.
   */
  it("refuses to guess at a route shape it does not understand", () => {
    expect(() => probeUrlFor("/library/@panel/detail")).toThrow(/route syntax/);
  });
});
