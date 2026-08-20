import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

/**
 * Reading `next build`'s output, and comparing two of its files to each other.
 *
 * This is the machinery behind `tests/route-manifest.test.ts`, and everything in it is a
 * pure function over JSON so that the assertions can be run against a manifest that was
 * never built — which is how the test proves it can fail.
 */

/** Where `next build` writes, relative to the repository root. */
const BUILD_DIRECTORY = ".next";

/**
 * Every route the build produced, from `.next/routes-manifest.json`.
 *
 * That file rather than `.next/app-path-routes-manifest.json`, which lists only the App
 * Router's. This one lists both routers, so a `pages/` directory appearing one day — the
 * cheapest way to add a route nobody thought about — is a route this check can still see.
 *
 * Static and dynamic routes are one list here because the difference is about rendering
 * and this is about reach. `/api/auth/[...all]` arrives with its brackets intact; see
 * `probeUrlFor`.
 */
interface RoutesManifest {
  staticRoutes: { page: string }[];
  dynamicRoutes: { page: string }[];
  /** Empty in this application, and asserted to be — see `RoutingAssumptions`. */
  basePath: string;
  rewrites: { beforeFiles: unknown[]; afterFiles: unknown[]; fallback: unknown[] };
}

/**
 * The compiled proxy matcher, from `.next/server/functions-config-manifest.json`.
 *
 * The key is `/_middleware` even though the file is `proxy.ts`: Next 16 renamed the
 * convention, not this manifest.
 *
 * `originalSource` is the string as written in `proxy.ts`, and reading it back out of the
 * build rather than importing it is the point of using this file at all: it is what makes
 * the check a comparison of two build outputs, so a matcher edited but not rebuilt is
 * caught instead of being checked in the form it used to have.
 */
interface FunctionsConfigManifest {
  functions?: Record<string, { matchers?: { originalSource: string }[] }>;
}

/**
 * Every App Router entry the build produced, from `.next/app-path-routes-manifest.json`,
 * keyed by the **source path it was compiled from** and valued with the URL it serves.
 *
 * That key is the only reason this file is read at all. `routes-manifest.json` gives the
 * URL and nothing else, and the loading-boundary audit has to get from a URL back to the
 * directory that owns it — `/library` is `app/(signed-in)/library`, and no amount of
 * string-munging on the URL would have found the route group.
 *
 * Route handlers are in here too, under a `/route` suffix rather than `/page`; see
 * `pageRoutes` for why they are dropped rather than checked.
 */
type AppPathRoutesManifest = Record<string, string>;

/**
 * What the build prerendered, from `.next/prerender-manifest.json`.
 *
 * This is how *dynamic* stops being a word in a source file and becomes something read out
 * of the build. `export const dynamic = "force-dynamic"` is a claim; a route absent from
 * both of these maps is the build having acted on it. Reading it this way also means a
 * route that becomes dynamic for some reason nobody wrote down — a cookie read that crept
 * into a shared helper — is a route the audit starts asking about on its own.
 */
interface PrerenderManifest {
  /** Fully prerendered paths, keyed by URL. */
  routes: Record<string, unknown>;
  /** Prerendered dynamic-segment paths (ISR fallbacks), keyed by route pattern. */
  dynamicRoutes: Record<string, unknown>;
}

/**
 * The two lists the audit compares. Kept as its own type so the failure cases in
 * `tests/route-manifest.test.ts` can build one by hand, with no build behind it.
 */
export interface RouteCoverageInput {
  /** Every route pattern the build produced, in manifest form. */
  routes: string[];
  /** The matcher sources the build actually compiled. */
  matcher: string[];
}

/**
 * What the check takes for granted about routing, read back out of the build so it can be
 * asserted rather than assumed. `matcherRunsOn` asks Next's matcher with an empty
 * `nextConfig`; a `basePath` or a rewrite would make that answer a different question from
 * the one the running server asks, and this is how that stops being invisible.
 */
export interface RoutingAssumptions {
  basePath: string;
  rewriteCount: number;
}

/**
 * One page in the build: the URL it serves, the app-directory segment it was compiled
 * from, and whether the build left it to be rendered on demand.
 *
 * Its own type, kept minimal for the same reason `RouteCoverageInput` is: the failure cases
 * in `tests/route-manifest.test.ts` build these by hand, with no build behind them, and a
 * fixture that has to carry fields the audit never reads is a fixture that stops being read
 * as one.
 */
export interface PageRoute {
  /** The URL pattern, as `routes-manifest.json` writes it — `/library/[entryId]`. */
  route: string;
  /** The path under `app/` that owns it — `(signed-in)/library/[entryId]`. */
  segment: string;
  /** Rendered on demand, rather than prerendered at build time. */
  dynamic: boolean;
}

export interface BuildArtifacts extends RouteCoverageInput {
  assumptions: RoutingAssumptions;
  /** Every page in the build. Route handlers are not here — see `pageRoutes`. */
  pages: PageRoute[];
}

function readManifest<T>(repositoryRoot: string, relativePath: string): T {
  const file = path.join(repositoryRoot, BUILD_DIRECTORY, relativePath);

  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch (cause) {
    /**
     * Reported and rethrown, never softened into a default. A missing manifest means
     * there is no build to check, and a check that quietly passes when it read nothing is
     * worse than no check — it is the shape of `SPEC.md` §3.2 one directory over.
     */
    throw new Error(
      `Cannot read ${relativePath} from ${BUILD_DIRECTORY}. This check compares the ` +
        "built route manifest against the compiled proxy matcher, so there has to be a " +
        "build: run `npm run build` first.",
      { cause },
    );
  }

  return JSON.parse(contents) as T;
}

/**
 * The build's pages, each with the segment it came from and whether it renders on demand.
 *
 * ── Why route handlers are dropped rather than exempted ──────────────────────────────
 *
 * `/api/auth/[...all]` and `/api/cron/nightly-sweep` are `route.ts` files. They render no
 * UI, so *pending* is not a state they can be in and a `loading.tsx` beside one would never
 * be mounted by anything. Dropping them here rather than naming them in the audit's
 * exemption list is the difference between a category the check does not apply to and a
 * decision somebody made about a surface — and the exemption list is only worth reading if
 * everything in it is the second kind.
 *
 * The `/page` and `/route` suffixes are the manifest's own, so this is reading the build's
 * classification rather than guessing from the URL.
 */
function pageRoutes(
  appPaths: AppPathRoutesManifest,
  prerendered: ReadonlySet<string>,
): PageRoute[] {
  const PAGE_SUFFIX = "/page";

  return Object.entries(appPaths)
    .filter(([sourcePath]) => sourcePath.endsWith(PAGE_SUFFIX))
    .map(([sourcePath, route]) => ({
      route,
      // `/(signed-in)/library/page` → `(signed-in)/library`, and `/page` → `""`, which is
      // `app/` itself and is where `app/page.tsx` lives.
      segment: sourcePath.slice(1, -PAGE_SUFFIX.length),
      dynamic: !prerendered.has(route),
    }));
}

/** Both manifests, read from one build. */
export function readBuildArtifacts(repositoryRoot: string): BuildArtifacts {
  const routes = readManifest<RoutesManifest>(repositoryRoot, "routes-manifest.json");
  const functions = readManifest<FunctionsConfigManifest>(
    repositoryRoot,
    path.join("server", "functions-config-manifest.json"),
  );
  const appPaths = readManifest<AppPathRoutesManifest>(
    repositoryRoot,
    "app-path-routes-manifest.json",
  );
  const prerender = readManifest<PrerenderManifest>(
    repositoryRoot,
    "prerender-manifest.json",
  );

  const matchers = functions.functions?.["/_middleware"]?.matchers;
  if (!matchers || matchers.length === 0) {
    throw new Error(
      "This build compiled no proxy matcher at all, so every route in it is open. " +
        "Either proxy.ts is gone, or it exports no `config.matcher` and the proxy is " +
        "therefore running on every request — which is not this application's gate.",
    );
  }

  return {
    routes: [
      ...routes.staticRoutes.map((route) => route.page),
      ...routes.dynamicRoutes.map((route) => route.page),
    ],
    matcher: matchers.map((matcher) => matcher.originalSource),
    pages: pageRoutes(
      appPaths,
      new Set([...Object.keys(prerender.routes), ...Object.keys(prerender.dynamicRoutes)]),
    ),
    assumptions: {
      basePath: routes.basePath,
      rewriteCount:
        routes.rewrites.beforeFiles.length +
        routes.rewrites.afterFiles.length +
        routes.rewrites.fallback.length,
    },
  };
}

/**
 * A concrete URL to ask the matcher about, from a route pattern that may not be one.
 *
 * The manifest describes `/api/auth/[...all]`; a matcher answers about `/api/auth/x/y`.
 * The substitutions are deliberately boring words rather than anything that could collide
 * with a path the matcher treats specially, and the catch-all becomes two segments so
 * that a matcher which only exempts one level is caught doing it.
 *
 * Anything left over after substitution throws. Parallel routes, intercepting routes and
 * whatever Next adds next would otherwise be probed as a literal `(.)` or `@slot` — a URL
 * nobody can request — and the matcher's answer about it would mean nothing while looking
 * like a pass.
 */
export function probeUrlFor(route: string): string {
  const probe = route
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "optional-catch-all")
    .replace(/\[\.\.\.[^\]]+\]/g, "catch-all/second-segment")
    .replace(/\[[^\]]+\]/g, "dynamic-segment");

  if (/[[\]()@]/.test(probe)) {
    throw new Error(
      `Cannot turn the route "${route}" into a URL to test: "${probe}" still has route ` +
        "syntax in it. Next has grown a route shape this check does not understand, and " +
        "tests/support/route-manifest.ts is what has to be told about it.",
    );
  }

  return probe;
}

/**
 * Whether the matcher runs on a URL — Next's own answer, not a second implementation.
 *
 * `unstable_doesMiddlewareMatch` is the same matching code the server uses, exported for
 * tests. Anything else here would be a private copy of path-to-regexp that agrees with
 * the real one right up until it does not.
 *
 * `nextConfig` is empty, which is an assumption rather than a fact: a `basePath` or a
 * rewrite in `next.config.ts` would make this answer a different question from the one
 * production asks. `tests/route-manifest.test.ts` asserts the build has neither, so the
 * assumption is checked where it is made rather than held here in a comment.
 */
export function matcherRunsOn(matcher: string[], url: string): boolean {
  return unstable_doesMiddlewareMatch({ config: { matcher }, nextConfig: {}, url });
}

export interface Audit {
  /** Routes the matcher does not run on, and that nothing named as exempt. */
  unprotected: string[];
  /** Routes named as exempt that the matcher runs on anyway — the list lying. */
  notActuallyExempt: string[];
  /** Names in the exempt list that no longer match a route in the build. */
  stale: string[];
}

/**
 * The whole check, as a function of its two inputs and nothing else.
 *
 * Every route in the build must be covered by the matcher unless it is one of the named
 * exemptions, and every named exemption must be a real route that really is uncovered.
 * The three failure lists are kept apart because they are three different mistakes: a
 * widened regex, a list that says something untrue, and a name left behind after the
 * route it described was deleted.
 */
export function auditRouteProtection(
  { routes, matcher }: RouteCoverageInput,
  exempt: readonly string[],
): Audit {
  const unprotected: string[] = [];
  const notActuallyExempt: string[] = [];

  for (const route of routes) {
    const covered = matcherRunsOn(matcher, probeUrlFor(route));
    const named = exempt.includes(route);

    if (!covered && !named) unprotected.push(route);
    if (covered && named) notActuallyExempt.push(route);
  }

  return {
    unprotected,
    notActuallyExempt,
    stale: exempt.filter((route) => !routes.includes(route)),
  };
}

/**
 * ── The loading-boundary audit (issue #180) ──────────────────────────────────────────
 *
 * Same shape as everything above: an impure reader, then a pure function over what it
 * returned. The reasoning for the audit itself is in `tests/route-manifest.test.ts`, beside
 * the exemption lists it reads; what follows is only how it is computed.
 */

/**
 * Next's own name for a segment's loading boundary, in every extension it will load one
 * from. This repository writes `.tsx` and only `.tsx`, and the wider pattern is here so
 * that a file added as `loading.js` is found rather than reported as a missing boundary —
 * a false failure being the one thing worse than a false pass in a check nobody remembers.
 */
const LOADING_BOUNDARY = /^loading\.(?:tsx|ts|jsx|js|mjs)$/;

/**
 * Whether a segment has a loading boundary of its own, read off the source tree.
 *
 * **This is the one input the build could not supply**, and that was established by
 * looking. No manifest names a boundary; a `loading.tsx` is a server component, so it is
 * folded into its page's chunk under a hashed Turbopack name with nothing stable to match
 * on — unlike `error.tsx`, which survives as a named chunk only because it is a client
 * component, which is an implementation detail and not something to build a check on.
 *
 * So the split is: the build says which routes exist, which of them are dynamic and which
 * segment each was compiled from, and this answers the one remaining question against the
 * directory that build named. The predicate is returned rather than called so that the
 * audit stays a pure function and the failure cases can hand it a set of segments written
 * out by hand.
 *
 * A segment the build named and the source tree does not have throws rather than answering
 * `false`, for `readManifest`'s reason one function up: the two have gone out of step, and
 * a check that quietly reports *no boundary here* for a directory it could not find is
 * reporting on nothing.
 */
export function loadingBoundaryReader(
  repositoryRoot: string,
): (segment: string) => boolean {
  return (segment) => {
    const directory = path.join(repositoryRoot, "app", segment);

    if (!existsSync(directory)) {
      throw new Error(
        `The build says a page was compiled from app/${segment}, and there is no such ` +
          "directory. The build and the source tree are not the same tree — rebuild with " +
          "`npm run build` before reading anything into this check's result.",
      );
    }

    return readdirSync(directory).some((entry) => LOADING_BOUNDARY.test(entry));
  };
}

export interface LoadingAudit {
  /** Dynamic pages with no boundary of their own, and nothing naming them exempt. */
  unbounded: string[];
  /** Named as exempt, but converted since — the list outliving the work it described. */
  notActuallyExempt: string[];
  /** Names in the exempt list that are no longer a dynamic page in the build. */
  stale: string[];
}

/**
 * Every dynamic page must have a loading boundary on its own segment unless it is named
 * exempt, and every named exemption must be a dynamic page that really has no boundary.
 *
 * The three failure lists are the proxy audit's three, kept apart for its reason: they are
 * three different mistakes — a surface converted by nobody, a list that says something
 * untrue, and a name left behind after the route it described was deleted.
 *
 * **Prerendered pages are not asked anything.** A page the build resolved before anything
 * reached the browser cannot keep a reader waiting, so it is neither reported as unbounded
 * nor something an exemption should have to be written for — naming one goes stale instead,
 * which is how a route that stops being dynamic gets noticed.
 *
 * `hasBoundary` is asked about the segment's **own** file and nothing above it. Next would
 * inherit a parent's boundary down the tree; this deliberately does not, because an
 * inherited boundary draws the parent surface's heading over the child's page. See the
 * commentary in `tests/route-manifest.test.ts`.
 */
export function auditLoadingBoundaries(
  pages: readonly PageRoute[],
  hasBoundary: (segment: string) => boolean,
  exempt: readonly string[],
): LoadingAudit {
  const dynamicPages = pages.filter((page) => page.dynamic);
  const unbounded: string[] = [];
  const notActuallyExempt: string[] = [];

  for (const page of dynamicPages) {
    const bounded = hasBoundary(page.segment);
    const named = exempt.includes(page.route);

    if (!bounded && !named) unbounded.push(page.route);
    if (bounded && named) notActuallyExempt.push(page.route);
  }

  return {
    unbounded,
    notActuallyExempt,
    stale: exempt.filter(
      (route) => !dynamicPages.some((page) => page.route === route),
    ),
  };
}
