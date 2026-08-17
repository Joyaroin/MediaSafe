import { readFileSync } from "node:fs";
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

export interface BuildArtifacts extends RouteCoverageInput {
  assumptions: RoutingAssumptions;
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

/** Both manifests, read from one build. */
export function readBuildArtifacts(repositoryRoot: string): BuildArtifacts {
  const routes = readManifest<RoutesManifest>(repositoryRoot, "routes-manifest.json");
  const functions = readManifest<FunctionsConfigManifest>(
    repositoryRoot,
    path.join("server", "functions-config-manifest.json"),
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
