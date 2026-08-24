import { describe, expect, it } from "vitest";

import { config } from "@/proxy";
import {
  auditLoadingBoundaries,
  auditRouteProtection,
  loadingBoundaryReader,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **The second audit — issue #180.** Every dynamic surface has a loading boundary.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * It lives in this file, on this file's machinery, because it is the same kind of check
 * asking about the same list: *here is everything the build produced, and here is the thing
 * every one of them must have.* The proxy audit's three failure lists, its named exemptions
 * with a reason each, and its hand-built proof that it can fail are all reproduced below
 * rather than reinvented, so that the two read as one habit and neither can be understood
 * without teaching the other.
 *
 * **It arrives with the first real use of it rather than after the rollout.** #180 converts
 * one surface; everything still unconverted is named below with a reason, and ticket 5
 * ([#181](https://github.com/Joyaroin/MediaSafe/issues/181)) empties `NOT_YET_CONVERTED`.
 * The enforcement existing first is what makes that ticket a deletion rather than a survey.
 *
 * ── What it reads, and the one thing the build could not tell it ─────────────────────
 *
 * The routes and which of them are dynamic come out of `next build`, exactly as above.
 * **Whether a segment has a boundary does not**, and that was established by looking rather
 * than assumed: no manifest names one, and the compiled `loading.tsx` is folded into its
 * page's server chunk under a hashed Turbopack name with nothing stable to match on. So the
 * build names the routes and the segment each was compiled from, and the source tree answers
 * whether the file is there — see `loadingBoundaryReader`, which is the impure edge of this
 * check in the same way `readBuildArtifacts` is the impure edge of the one above.
 *
 * ── Own segment, never inherited ─────────────────────────────────────────────────────
 *
 * A `loading.tsx` wraps its segment *and every segment below it*, so `/library/[entryId]`
 * would count as covered by the grid's boundary if this asked about effective coverage. It
 * asks about the segment's own file instead, for the reason `DESIGN.md` §9 gives when it
 * refuses to wrap the Up next rails: **one surface, one pending decision, and it is the
 * route's.** An inherited boundary is another surface's decision applied to this one, and it
 * shows on the glass — the library's own heading printed over a title's page. Counting it as
 * conversion would be the check passing for a surface nobody converted.
 */

/**
 * **Routes that await nothing the reader can see.** No boundary, and the absence is a
 * decision rather than an oversight — `DESIGN.md` §9 names the shapes and the test:
 * **the session read is not content.** Every one of these awaits `requireUserId()`, so
 * *does it await something* exempts nothing and is the wrong question; what matters is
 * whether anything **on the glass** is still unresolved.
 *
 * These four never move to the list below. A boundary added to any of them fails this check
 * as `notActuallyExempt`, which is the intended reading: the decision was contradicted.
 */
const NO_PENDING_STATE = [
  /**
   * §9's first shape, *nothing but the session*, by name. `/import` reads no data at all —
   * the whole screen is its own state, and there is nothing for a dim line to stand in for.
   */
  "/import",
  /**
   * §9's second shape, *a read that decides which screen, not what is on one*, by name.
   * `requireImportOfferAnswered()` resolves to a redirect or to a static page, and a
   * boundary would flash a pending line for a surface the reader may never be sent to.
   */
  "/welcome",
  /**
   * §9's second shape again. `isSignedIn()` decides between a redirect to `/` and a form
   * that is a literal in the source; `searchParams` is not a read. **§9 does not name this
   * route** — it lists `/welcome` — so this entry is that rule applied rather than quoted,
   * and it is written out here so a reader can disagree with the application instead of
   * having to notice it happened.
   */
  "/sign-in",
  /**
   * §9's first shape. The page awaits only the session; the catalogue query belongs to
   * `search-surface.tsx`, a client component running its own four-phase union through a
   * server action. That region's pending state is radius 3 and is already built — a route
   * boundary here would draw a second one for a read the route does not make.
   */
  "/search",
] as const;

/**
 * **The list [#181](https://github.com/Joyaroin/MediaSafe/issues/181) emptied.**
 *
 * It held eleven routes — `/lists`, `/lists/[listId]`, `/settings`,
 * `/settings/delete-account`, `/titles/[kind]/[tmdbId]`, `/up-next` and its five phone
 * group screens, of which the five were deleted outright by
 * [#250](https://github.com/Joyaroin/MediaSafe/issues/250) — every one of them a surface
 * that genuinely waits on data the reader came to see, and every one of them left the previous screen frozen on the glass until its
 * queries resolved. Each got a `loading.tsx` of its own; `NO_PENDING_STATE` above is what
 * remains, by decision rather than by backlog.
 *
 * The array stays rather than disappearing, so that a route added here in error fails as
 * `notActuallyExempt` instead of silently reopening a list nobody is watching.
 */
const NOT_YET_CONVERTED: readonly string[] = [];

/** The two lists are one exemption list to the audit, and two to a reader. */
const EXEMPT_FROM_BOUNDARY = [...NO_PENDING_STATE, ...NOT_YET_CONVERTED];

describe("every dynamic surface has a loading boundary", () => {
  const built = readBuildArtifacts(process.cwd());
  const hasBoundary = loadingBoundaryReader(process.cwd());

  it("covers every dynamic page in the build except the ones named above", () => {
    const audit = auditLoadingBoundaries(built.pages, hasBoundary, EXEMPT_FROM_BOUNDARY);

    // Three separate assertions rather than one on the whole object, so a failure names
    // which of the three mistakes was made — matching the proxy audit directly above.
    expect(audit.unbounded).toEqual([]);
    expect(audit.notActuallyExempt).toEqual([]);
    expect(audit.stale).toEqual([]);
  });

  /**
   * The converted surface, asserted positively.
   *
   * Every assertion above is a `toEqual([])`, and an empty list is also what a check that
   * has stopped looking returns. This is the one that would fail if `built.pages` came back
   * empty, if the segment paths stopped matching the source tree, or if the boundary reader
   * started answering `false` for everything — three ways for the audit to pass while
   * proving nothing.
   */
  it("finds the boundary on each of the library's own three segments", () => {
    expect(hasBoundary("(signed-in)/library")).toBe(true);
    expect(hasBoundary("(signed-in)/library/[entryId]")).toBe(true);
    expect(hasBoundary("(signed-in)/library/[entryId]/remove")).toBe(true);
  });

  /**
   * The six segments of #181's eleven that still exist, asserted the same way — a floor
   * against the audit quietly passing rather than actually looking, on the batch that
   * ticket is responsible for rather than the one before it.
   */
  it("finds the boundary on every segment #181 converts that still exists", () => {
    expect(hasBoundary("(signed-in)/lists")).toBe(true);
    expect(hasBoundary("(signed-in)/lists/[listId]")).toBe(true);
    expect(hasBoundary("(signed-in)/settings")).toBe(true);
    expect(hasBoundary("(signed-in)/settings/delete-account")).toBe(true);
    expect(hasBoundary("(signed-in)/titles/[kind]/[tmdbId]")).toBe(true);
    expect(hasBoundary("(signed-in)/up-next")).toBe(true);
  });

  /**
   * **The five phone group screens #250 removed, asserted as gone.**
   *
   * The acceptance criterion is that *the route manifest reflects the five removed routes*,
   * and the manifest here is the build's own rather than a list anybody maintains — so this
   * reads what `next build` actually emitted. A `page.tsx` left behind, or a route restored
   * by a merge, fails here rather than shipping five screens nothing links to.
   *
   * The two states those groups showed and the rails do not — watchlist and abandoned —
   * stay reachable through the library's status filters, which are `/library`'s own
   * controls and not routes of their own to assert.
   */
  it.each([
    "/up-next/ongoing",
    "/up-next/coming-back",
    "/up-next/old-friends",
    "/up-next/watchlist",
    "/up-next/abandoned",
  ])("has no route left at %s", (route) => {
    expect(built.pages.map((one) => one.route)).not.toContain(route);
    expect(built.routes).not.toContain(route);
  });

  /**
   * `/stats` — issue #227, and the surface with the most to wait on: `accountStats` makes
   * eight statements, behind a tab a reader taps from anywhere. It arrives with a boundary
   * rather than being converted later, and this is the floor that says so.
   */
  it("finds the boundary on the Stats destination #227 adds", () => {
    expect(hasBoundary("(signed-in)/stats")).toBe(true);
  });

  /**
   * And negatively, on the four segments §9 decided genuinely have no pending state to
   * draw — `/search`'s own read belongs to `search-surface.tsx`'s radius-3 union, not to a
   * route boundary. `NO_PENDING_STATE` is where the reason for each of the four lives.
   */
  it("does not find one where none was ever meant to land", () => {
    expect(hasBoundary("(signed-in)/search")).toBe(false);
  });

  /**
   * The build still has dynamic pages in it, which is the premise the whole audit rests on.
   * Asserted as a floor rather than a count: `DESIGN.md` §9 refuses to write a route count
   * down for the reason §12 gives — *a number duplicated into a file with no reason to know
   * it is wrong by default* — and a test that has to be edited every time a route is added
   * is that defect with a different filename.
   */
  it("is looking at a build that has dynamic pages in it", () => {
    expect(built.pages.filter((page) => page.dynamic).length).toBeGreaterThan(
      EXEMPT_FROM_BOUNDARY.length,
    );
  });
});

/**
 * **This check can fail too**, and for the reason the proxy audit's own failure suite gives:
 * a test that has only ever been green is a test nobody has seen work. Same machinery, same
 * posture — hand-built inputs with no build behind them, so the evidence is permanent rather
 * than something proved once by hand and then deleted.
 */
describe("the boundary check fails when a surface is left waiting", () => {
  /** A page in the build, as the audit wants one, with no build behind it. */
  const page = (route: string, segment: string, dynamic = true) => ({
    route,
    segment,
    dynamic,
  });

  /** A boundary reader over a hand-written set of segments. */
  const boundariesOn =
    (...segments: string[]) =>
    (segment: string) =>
      segments.includes(segment);

  it("reports a dynamic route that nobody gave a boundary or a reason", () => {
    const audit = auditLoadingBoundaries(
      [page("/library", "library"), page("/reports", "reports")],
      boundariesOn("library"),
      ["/import"],
    );

    expect(audit.unbounded).toEqual(["/reports"]);
  });

  /**
   * **The stale exemption the acceptance criteria ask for**: a route named as exempt that
   * has a boundary now. It is how `NOT_YET_CONVERTED` shrinks — #181 converting a surface
   * fails this check until the name comes out of the list, so the list cannot quietly
   * outlive the work it describes.
   */
  it("reports an exemption for a route that has since been converted", () => {
    const audit = auditLoadingBoundaries(
      [page("/up-next", "(signed-in)/up-next")],
      boundariesOn("(signed-in)/up-next"),
      ["/up-next"],
    );

    expect(audit.notActuallyExempt).toEqual(["/up-next"]);
  });

  it("reports an exemption left behind by a deleted route", () => {
    const audit = auditLoadingBoundaries(
      [page("/library", "library")],
      boundariesOn("library"),
      ["/lists"],
    );

    expect(audit.stale).toEqual(["/lists"]);
  });

  /**
   * A prerendered page never waits, so it is not this check's business and is not something
   * an exemption should have to be written for. Both halves are asserted: it is not
   * reported as unbounded, and naming it exempt goes stale rather than passing quietly.
   */
  it("asks nothing of a page the build prerendered", () => {
    const pages = [page("/", "", false)];

    expect(auditLoadingBoundaries(pages, boundariesOn(), []).unbounded).toEqual([]);
    expect(auditLoadingBoundaries(pages, boundariesOn(), ["/"]).stale).toEqual(["/"]);
  });

  /**
   * **Inheritance is not conversion.** The audit asks about the segment's own file, so a
   * child of a converted segment is still reported — which is the whole reason
   * `/library/[entryId]` and `/library/[entryId]/remove` got boundaries of their own in
   * #180 rather than being left to the grid's.
   */
  it("does not let a child route inherit its parent's boundary", () => {
    const audit = auditLoadingBoundaries(
      [page("/library", "library"), page("/library/[entryId]", "library/[entryId]")],
      boundariesOn("library"),
      [],
    );

    expect(audit.unbounded).toEqual(["/library/[entryId]"]);
  });
});
