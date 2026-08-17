import { describe, expect, it } from "vitest";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "@/proxy";
import {
  auditRouteProtection,
  probeUrlFor,
  readBuildArtifacts,
  type MatcherCheck,
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
 */

/**
 * **The two exemptions, named.**
 *
 * Everything else in the build must be behind the matcher. Adding a third route to this
 * list is the visible diff issue #43 asks for — a line in a pull request with a name on
 * it, rather than two characters appended to a regular expression where nobody looks.
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
] as const;

/** Next's own matcher, asked the way the server asks it. */
const matches: MatcherCheck = (matcher, url) =>
  unstable_doesMiddlewareMatch({ config: { matcher }, nextConfig: {}, url });

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

  /**
   * The tripwire on the exemption list itself. The audit below already fails when an
   * uncovered route is not named here, so the only way to widen the gate is to add a name
   * — and this line is what makes that addition impossible to do without also editing a
   * number that says how many there are meant to be.
   */
  it("exempts two routes and no others", () => {
    expect(EXEMPT).toHaveLength(2);
  });

  it("covers every route in the build except those two", () => {
    const audit = auditRouteProtection(built.routes, built.matcher, EXEMPT, matches);

    // Three separate assertions rather than one on the whole object, so a failure names
    // which of the three mistakes was made rather than printing a diff of all of them.
    expect(audit.unprotected).toEqual([]);
    expect(audit.notActuallyExempt).toEqual([]);
    expect(audit.stale).toEqual([]);
  });

  /**
   * The sign-in page has to be able to load itself.
   *
   * `_next/` is excluded from the matcher, and this is the reason: without it the gate
   * redirects the compiled JavaScript and CSS of the sign-in page to the sign-in page,
   * and the one surface a signed-out reader is meant to reach is the one surface that
   * cannot render. Nothing in the route manifest maps to these paths, so the audit above
   * never sees them — which is exactly why they are asserted here instead.
   */
  it("lets the build output through", () => {
    expect(matches(built.matcher, "/_next/static/chunks/main.js")).toBe(false);
    expect(matches(built.matcher, "/_next/image")).toBe(false);
  });

  /**
   * The exemptions are anchored, so a route added under one of their prefixes is covered
   * rather than quietly inheriting the exemption. Neither path exists today; the point is
   * what happens on the day one of them does.
   */
  it("does not extend either exemption to its neighbours", () => {
    expect(matches(built.matcher, "/sign-in/help")).toBe(true);
    expect(matches(built.matcher, "/sign-instead")).toBe(true);
    expect(matches(built.matcher, "/api/authorize")).toBe(true);
  });
});

/**
 * **The check can fail.** A test that has only ever been green is a test nobody has seen
 * work, and this one guards a property that will be checked long after everyone has
 * forgotten it is here.
 *
 * These run the same audit against manifests that were never built, so the failure is
 * permanent evidence rather than something proved once by hand and then removed.
 */
describe("the check fails when the gate is widened", () => {
  it("reports a route the matcher was widened to skip", () => {
    const audit = auditRouteProtection(
      ["/", "/sign-in", "/reports"],
      ["/((?!_next/|sign-in$|reports$).*)"],
      EXEMPT,
      matches,
    );

    expect(audit.unprotected).toEqual(["/reports"]);
  });

  it("reports an exemption that is not one", () => {
    const audit = auditRouteProtection(
      ["/", "/sign-in"],
      // No exemptions at all: the matcher runs on `/sign-in` too.
      ["/(.*)"],
      EXEMPT,
      matches,
    );

    expect(audit.notActuallyExempt).toEqual(["/sign-in"]);
  });

  it("reports an exemption left behind by a deleted route", () => {
    const audit = auditRouteProtection(
      ["/", "/sign-in"],
      ["/((?!_next/|sign-in$|api/auth(?:$|/)).*)"],
      EXEMPT,
      matches,
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
