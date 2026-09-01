import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { config } from "@/proxy";
import {
  auditLoadingBoundaries,
  auditModalSlots,
  auditRouteProtection,
  loadingBoundaryReader,
  matcherRunsOn,
  probeUrlFor,
  readBuildArtifacts,
  slotDefaultReader,
  withoutInterception,
  type ModalRoute,
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
   * server asks only while there is no `basePath` and no **authored** rewrite. Add either
   * and every answer above quietly starts being about a different application than the one
   * running.
   *
   * ── Why *authored*, since issue #254 ────────────────────────────────────────────────
   *
   * This used to read `rewriteCount === 0`, and the episode modal makes that false: an
   * intercepting route is compiled as a rewrite, so the build now has one that nobody
   * wrote. Loosening the assertion to *some rewrites are fine* would have been the wrong
   * repair — it would exempt exactly the thing the check exists to notice.
   *
   * So the rewrites are read by shape instead of counted (`interceptionsIn`). A rewrite
   * counts as the framework's own only if its destination carries an interception marker
   * and its source is that same path with the marker taken out; everything else is
   * authored, and authored is what must stay at zero. The interceptions themselves are not
   * unchecked — they are asserted, by name and by URL, in the modal-slot audit below.
   *
   * The exemption is sound rather than convenient: `beforeFiles` is before the
   * *filesystem*, not before middleware, so an interception rewrite cannot change which
   * URLs the gate is asked about. What it changes is which component renders afterwards.
   *
   * ── And issue #273 takes the build back to no rewrites at all ───────────────────────
   *
   * Both interceptions are deleted, so the number this paragraph was written to
   * accommodate is zero again and `authoredRewriteCount` and the raw count now agree. The
   * shape-reading stays rather than being wound back to `rewriteCount === 0`: it is the
   * stricter of the two — an authored rewrite is caught whether or not an interception
   * exists beside it — and the audit below is what holds the *total* at zero, which is
   * the property #273 actually adds.
   */
  it("routes on the terms the matcher was asked about", () => {
    expect(built.assumptions.basePath).toBe("");
    expect(built.assumptions.authoredRewriteCount).toBe(0);
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
 * These three never move to the list below. A boundary added to any of them fails this check
 * as `notActuallyExempt`, which is the intended reading: the decision was contradicted.
 *
 * **It was four until issue #273**, and the fourth — `/[...catchAll]`, the two modal slots'
 * closers — did not leave this list because a boundary was written for it. It left because
 * the route stopped existing: the interceptions are deleted, so the slots are deleted, so
 * the closers that made a slot render nothing on a soft navigation have nothing left to
 * close. The entry is taken out rather than left to rot, which is what `stale` would have
 * called it — and taking a name *out* of an exemption list is the direction this list is
 * allowed to move in without an argument.
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
   * The episode page — issue #253, moved to its own top-level route by issue #289 and
   * still the segment most exposed to the inheritance problem this audit is about: it has
   * a `loading.tsx` of its own because without one a reader tapping an episode would be
   * shown an ancestor's pending render — the *title's* surface standing in for an
   * episode's while it lived under `[entryId]`, and now the group's. `DESIGN.md` §9 treats
   * that as a heading naming the wrong screen rather than a cosmetic slip, and *own
   * segment, never inherited* is the clause of this audit that catches it.
   *
   * Asserted positively because the audits above are all `toEqual([])`, and an empty list
   * is what a check that has stopped looking returns too. The boundary **moved with the
   * route**; it was not dropped and re-added.
   */
  it("finds the boundary on the episode page, at the route #289 moved it to", () => {
    expect(hasBoundary("(signed-in)/episodes/[episodeId]")).toBe(true);
  });

  /**
   * And the route itself is in the build, behind the matcher like everything else.
   *
   * It needs no exemption and gets none: `EXEMPT` above is the three routes a reader may
   * reach with no session, and an episode of a title in *your* library is the opposite of
   * that. Asserted positively rather than left to `audit.unprotected` being empty, for the
   * reason the boundary floor above exists — so that a route silently dropped from the
   * build fails here instead of passing three emptiness checks.
   *
   * **Reorganising the address space is exactly the change that could breach constraint 5
   * silently**, which is why the matcher is asserted against the new path rather than
   * trusted to a catch-all it happens to fall under today.
   */
  it("builds the episode route at its own address, carrying one id", () => {
    expect(built.routes).toContain("/episodes/[episodeId]");
    expect(matcherRunsOn(built.matcher, "/episodes/episode-9")).toBe(true);
  });

  /**
   * **And the address it left does not resolve** — issue #289's second criterion, read off
   * the build's own manifest.
   *
   * The old path is not redirected: it ceases to exist, and a bookmark to it 404s. That
   * was the accepted trade when a permanent redirect rule was offered and declined, so
   * what has to be checked is that the route is *gone* rather than merely unlinked — a
   * `page.tsx` left behind, or the directory restored by a merge, serves both addresses
   * and nothing on the glass says which one a reader is on.
   */
  it("has no route left beneath the entry the episode used to hang from", () => {
    expect(built.pages.map((one) => one.route)).not.toContain(
      "/library/[entryId]/episode/[episodeId]",
    );
    expect(built.routes).not.toContain("/library/[entryId]/episode/[episodeId]");
  });

  /**
   * The six segments of #181's eleven that still exist, asserted the same way — a floor
   * against the audit quietly passing rather than actually looking, on the batch that
   * ticket is responsible for rather than the one before it. #250 deleted the other five.
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
   * **`/stats`, removed by #249, asserted as gone** — the same criterion one ticket later
   * and for the same reason: *the route manifest reflects the removal and no longer lists
   * the stats route*. A page restored by a merge fails here rather than shipping a
   * destination the phone's fourth tab and the sidebar's sixth no longer lead to.
   */
  it("has no route left at /stats", () => {
    expect(built.pages.map((one) => one.route)).not.toContain("/stats");
    expect(built.routes).not.toContain("/stats");
  });

  /**
   * `/you` — issue #247, and the phone's fourth tab since #249 retired `/stats` and
   * repointed the slot here. It is a page made entirely of reads, behind a tab a reader
   * taps from anywhere, so it arrives with a boundary rather than being converted later,
   * and this is the floor that says so.
   *
   * The assertion this replaces named `(signed-in)/stats`, and #227's reasoning for it —
   * *the surface with the most to wait on* — went with the eight statements behind it.
   * Three concurrent reads are still three round trips under a fixed tab.
   */
  it("finds the boundary on the You destination #249 points the fourth tab at", () => {
    expect(hasBoundary("(signed-in)/you")).toBe(true);
  });

  /**
   * And negatively, on the three segments §9 decided genuinely have no pending state to
   * draw — `/search`'s own read belongs to `search-surface.tsx`'s radius-3 union, not to a
   * route boundary. `NO_PENDING_STATE` is where the reason for each of the three lives.
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
  /** A page in the build, as the audit wants one, with no build behind it. `slot` is
   *  `null` — the implicit `children` slot, which is every page in this suite. The modal
   *  audit's own fixtures below are where a named slot is written out. */
  const page = (route: string, segment: string, dynamic = true) => ({
    route,
    segment,
    dynamic,
    slot: null,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **The third audit — issue #254, reversed by issue #273.** Nothing intercepts, and there
 * is no slot for anything to intercept into.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The reversal, written as one ─────────────────────────────────────────────────────
 *
 * #254 built this audit to prove the opposite property: that `/library/[entryId]`,
 * `/titles/[kind]/[tmdbId]` and `/library/[entryId]/episode/[episodeId]` each compiled an
 * *intercepted* second render into a named parallel slot, so that pressing one of them
 * raised a sheet over the screen the reader was on. #273 deletes both slots and both
 * interceptions: a tap navigates, and there is one model for what a tap does.
 *
 * **The audit is kept and its list is emptied**, rather than the audit going with the
 * feature. It is the same machine read the other way round — *every interception in the
 * build is a line somebody wrote down* — and with nothing written down it says *the build
 * contains no interception at all*. Deleting it would leave the reversal unguarded, and
 * unguarded here means invisible: a slot adds no path segment and neither does `(.)`, so
 * an interception reintroduced by a merge or by a well-meant revert would build, satisfy
 * the typechecker, serve the right URL, and show up only as a sheet raising over a tab
 * nobody decided to ship. `unnamed` is the list that fails on that, by URL.
 *
 * ── What it reads ───────────────────────────────────────────────────────────────────
 *
 * The rewrites the build compiled and the slot each page was compiled into — both sides,
 * so half an interception (a rewrite with no page filed behind it, or the reverse) is
 * still caught. `slotDefaultReader` is still handed in and is never called while the list
 * is empty: it is the fifth of the audit's five checks, and wiring it now means a slot
 * that ever comes back arrives with its `default` already being asked about.
 */

/**
 * **Every route that opens as a modal, and the slot it opens in — now none.**
 *
 * The list held three entries and the list was the point rather than its length: adding a
 * modal is a line in a pull request with a name on it, exactly as adding a proxy exemption
 * is. #273 takes all three out, which leaves that discipline in its strongest form — every
 * interception in the build must be named here, and nothing is named here.
 *
 * The three that were removed, so a diff putting one back has something to argue with:
 * `/library/[entryId]` and `/titles/[kind]/[tmdbId]` in `@title`, and
 * `/library/[entryId]/episode/[episodeId]` in `@episode`.
 */
const MODAL_ROUTES: readonly ModalRoute[] = [];

/** The route group the two slots lived in. Still named, because the assertion below is
 *  that this directory now holds no slot at all — and a slot contributes no path segment,
 *  which is the whole reason its absence has to be checked rather than seen. */
const SLOT_GROUP = "(signed-in)";

describe("nothing intercepts, so opening a title is an ordinary navigation", () => {
  const built = readBuildArtifacts(process.cwd());
  const hasDefault = slotDefaultReader(process.cwd(), SLOT_GROUP);

  it("names no modal route, and the build compiled none either", () => {
    const audit = auditModalSlots(
      built.pages,
      built.assumptions.interceptions,
      MODAL_ROUTES,
      hasDefault,
    );

    // Five separate assertions rather than one on the whole object, so a failure names
    // which of the five mistakes was made — matching the two audits above. `unnamed` is
    // the one carrying #273's property; the other four are empty because the list is.
    expect(audit.missing).toEqual([]);
    expect(audit.unnamed).toEqual([]);
    expect(audit.wrongSlot).toEqual([]);
    expect(audit.withoutFullPage).toEqual([]);
    expect(audit.withoutDefault).toEqual([]);
  });

  /**
   * The same property read straight off both manifests rather than only through the audit,
   * because `unnamed` being empty is also what an audit handed no pages would return.
   */
  it("compiles no interception route and no interception rewrite", () => {
    expect(built.pages.filter((page) => page.route.includes("(."))).toEqual([]);
    expect(built.pages.filter((page) => page.segment.includes("(."))).toEqual([]);
    expect(built.assumptions.interceptions).toEqual([]);

    // The rewrite an interception compiles lands in `beforeFiles`. Nothing in this
    // application has ever authored a rewrite, so all three lists are empty now, and
    // `authoredRewriteCount` above is the assertion that keeps the authored ones at zero.
    expect(built.rewrites.beforeFiles).toEqual([]);
    expect(built.rewrites.afterFiles).toEqual([]);
    expect(built.rewrites.fallback).toEqual([]);
  });

  /** And no page was compiled into a named slot — the other half of *there is no modal*.
   *  An interception needs a slot to land in; a slot with no interception in it is the
   *  emptier failure but still a hole in a layout nobody is filling. */
  it("compiles every page into children and none into a modal slot", () => {
    expect(built.pages.filter((page) => page.slot !== null)).toEqual([]);
  });

  /**
   * The source tree, which is where a slot actually is. The build reads what is on disk,
   * so a `@`-directory left behind — deleted from the layout's props but not from the
   * filesystem — is a slot the next `next build` picks straight back up.
   */
  it("has no slot directory left beside the signed-in layout", () => {
    const group = readdirSync(path.join(process.cwd(), "app", SLOT_GROUP));

    expect(group.filter((entry) => entry.startsWith("@"))).toEqual([]);
  });

  /**
   * **And the routes that used to be intercepted are still routes.** The reversal is that
   * they open as pages, not that they stopped existing — asserted positively for the
   * reason every audit in this file carries a floor: an empty list is also what a check
   * that has stopped looking returns.
   *
   * `/library/[entryId]/remove` is in this list because the title interception's optional
   * catch-all, `(.)library/[entryId]/[[...rest]]`, matched one segment *deeper* than the
   * route it shadowed — so the remove confirmation was reached with a title sheet raised
   * over it. A destructive confirmation is an ordinary page navigation now.
   */
  it.each([
    "/library/[entryId]",
    // #289's address for the episode. The reversal is about how a route opens, not where
    // it lives, so the property is asserted against wherever the route is now.
    "/episodes/[episodeId]",
    "/library/[entryId]/remove",
    "/titles/[kind]/[tmdbId]",
  ])("still builds %s as an ordinary page behind the matcher", (route) => {
    expect(built.routes).toContain(route);
    expect(matcherRunsOn(built.matcher, probeUrlFor(route))).toBe(true);
  });

  /**
   * The slot closers are gone too, and they earn their own line because they were the one
   * route in the build no reader could ever request: `@title/[...catchAll]/page.tsx` and
   * `@episode/[...catchAll]/page.tsx` both compiled to `/[...catchAll]`, their entire body
   * was `return null`, and their job was to make a slot render nothing on a soft
   * navigation so an open dialog did not follow the reader to the next screen. No dialog,
   * no closer — and `NO_PENDING_STATE` above lost its fourth entry with them.
   */
  it("has no slot closer left at /[...catchAll]", () => {
    expect(built.pages.map((one) => one.route)).not.toContain("/[...catchAll]");
    expect(built.routes).not.toContain("/[...catchAll]");
  });
});

/**
 * **This check can fail too.** Same posture as the two failure suites above: hand-built
 * inputs with no build behind them, so the evidence is permanent rather than something
 * proved once by hand and then deleted.
 *
 * **It matters more since #273 emptied the list**, not less. Every assertion in the suite
 * above is now an emptiness, and an audit that had quietly stopped looking would return
 * exactly the same answers. *Reports an interception nothing names* is the one that proves
 * otherwise: it hands the audit an intercepted page against a list of nothing — which is
 * the shape of the live check — and the audit reports it.
 */
describe("the modal check fails when the slot goes missing", () => {
  /** A page in the build, as this audit wants one. */
  const modalPage = (route: string, segment: string, slot: string | null = null) => ({
    route,
    segment,
    dynamic: true,
    slot,
  });

  /** The full page, and its intercepted render in `@modal`. */
  const FULL = modalPage(
    "/library/[entryId]/episode/[episodeId]",
    "(signed-in)/library/[entryId]/episode/[episodeId]",
  );
  const MODAL = modalPage(
    "/(.)library/[entryId]/episode/[episodeId]",
    "(signed-in)/@modal/(.)library/[entryId]/episode/[episodeId]",
    "@modal",
  );

  const EXPECTED = [
    { route: "/library/[entryId]/episode/[episodeId]", slot: "@modal" },
  ] as const;

  const withDefault = (slot: string) => slot === "@modal";

  /**
   * **The one this audit was written for.** The slot directory is gone; the route still
   * builds, still serves, still shows the episode. Nothing else in the suite notices.
   */
  it("reports a modal route the build stopped intercepting", () => {
    const audit = auditModalSlots([FULL], [], EXPECTED, withDefault);

    expect(audit.missing).toEqual(["/library/[entryId]/episode/[episodeId]"]);
  });

  /** A modal appearing that nobody decided on — the exemption list's own discipline. */
  it("reports an interception nothing names", () => {
    const audit = auditModalSlots(
      [FULL, MODAL, modalPage("/lists", "(signed-in)/lists")],
      [],
      [],
      withDefault,
    );

    expect(audit.unnamed).toEqual(["/library/[entryId]/episode/[episodeId]"]);
  });

  /**
   * The same failure reached from the other file: a rewrite the build compiled with no
   * page filed behind it. Read from both so that half an interception is still caught.
   */
  it("reports an interception that compiled a rewrite and no page", () => {
    const audit = auditModalSlots(
      [FULL],
      [{ route: "/lists/[listId]", intercepted: "/(.)lists/[listId]" }],
      EXPECTED,
      withDefault,
    );

    expect(audit.unnamed).toEqual(["/lists/[listId]"]);
  });

  /**
   * The slot moved. This is the case that looks identical to the reader — no modal — and
   * has a completely different fix from `missing`, which is why it is its own list.
   */
  it("reports an interception filed under a slot the layout does not render", () => {
    const audit = auditModalSlots(
      [
        FULL,
        modalPage(
          "/(.)library/[entryId]/episode/[episodeId]",
          "(signed-in)/@sheet/(.)library/[entryId]/episode/[episodeId]",
          "@sheet",
        ),
      ],
      [],
      EXPECTED,
      withDefault,
    );

    expect(audit.wrongSlot).toEqual(["/library/[entryId]/episode/[episodeId]"]);
  });

  /**
   * **A modal over nothing.** The intercepted render is there and the page it falls back
   * to is not, so a shared link or a refresh 404s — #254's own acceptance criterion,
   * failing.
   */
  it("reports a modal with no full page behind it", () => {
    const audit = auditModalSlots([MODAL], [], EXPECTED, withDefault);

    expect(audit.withoutFullPage).toEqual(["/library/[entryId]/episode/[episodeId]"]);
  });

  /** The `default` deleted — the failure that takes the rest of the application with it. */
  it("reports a slot with no default", () => {
    const audit = auditModalSlots([FULL, MODAL], [], EXPECTED, () => false);

    expect(audit.withoutDefault).toEqual(["/library/[entryId]/episode/[episodeId]"]);
  });

  /**
   * And the marker itself, since every list above is keyed on reading it correctly. All
   * four of Next's spellings, and a route that has none.
   */
  it("reads every interception marker the framework has", () => {
    expect(withoutInterception("/(.)library/[entryId]")).toBe("/library/[entryId]");
    expect(withoutInterception("/(..)photos/[id]")).toBe("/photos/[id]");
    expect(withoutInterception("/(..)(..)photos/[id]")).toBe("/photos/[id]");
    expect(withoutInterception("/(...)photos/[id]")).toBe("/photos/[id]");
    expect(withoutInterception("/library/[entryId]")).toBe("/library/[entryId]");
  });
});
