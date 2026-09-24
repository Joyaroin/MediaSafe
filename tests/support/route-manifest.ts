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
  rewrites: {
    beforeFiles: BuiltRewrite[];
    afterFiles: BuiltRewrite[];
    fallback: BuiltRewrite[];
  };
}

/**
 * One rewrite the build compiled.
 *
 * Nothing in `next.config.ts` writes one. Every rewrite in this application's build is
 * the framework's own machinery for an **intercepting route** (issue #254): interception
 * is compiled as a `beforeFiles` rewrite from the URL the reader presses to the internal
 * route the intercepted render is filed under, conditioned on the `next-url` header —
 * which only a client-side navigation sends. That header condition *is* the difference
 * between a press inside the application and an address typed into the bar, and it is why
 * a refresh renders the full page rather than a modal over nothing.
 *
 * Read as a shape rather than counted, because a count cannot tell those apart from a
 * rewrite somebody added by hand — and only the second kind changes what
 * `matcherRunsOn`'s empty `nextConfig` is answering. See `interceptionsIn`.
 */
interface BuiltRewrite {
  source: string;
  destination: string;
  has?: { type: string; key: string; value?: string }[];
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
  /**
   * Rewrites in the build that no interception accounts for — a `next.config.ts`
   * `rewrites()` somebody added, in other words. This is the number that has to be zero:
   * an authored rewrite makes `matcherRunsOn`'s empty `nextConfig` answer a question about
   * a different application.
   *
   * Interception rewrites are deliberately **not** counted here. They rewrite *after* the
   * proxy has run — `beforeFiles` is before the filesystem, not before middleware — so
   * they cannot change which URLs the gate sees. They are checked instead, by shape, in
   * `interceptions` below and in the slot audit.
   */
  authoredRewriteCount: number;
  /** Every intercepting route the build compiled — see `interceptionsIn`. */
  interceptions: Interception[];
}

/**
 * ── Parallel slots and intercepting routes (issue #254) ──────────────────────────────
 *
 * Nothing in this application used either until the episode modal. Both are invisible in
 * the URL by design — a slot (`@modal`) and a route group (`(signed-in)`) contribute no
 * path segment — which is exactly why the build has to be asked about them rather than the
 * source tree read for folder names. The failure this guards is the quiet one: delete the
 * slot, or rename the intercepted directory by a character, and the application keeps
 * building and keeps working. Episode detail simply stops arriving as a modal and starts
 * replacing the page the reader was on, and nothing anywhere says so.
 */

/**
 * Next's interception markers, as they appear inside a route: `(.)` same level, `(..)` one
 * above, `(..)(..)` two above, `(...)` from the root. Written as one alternation with a
 * repeat so `(..)(..)`  is matched as the single marker it is rather than as two.
 */
const INTERCEPTION_MARKER = /(?:\((?:\.|\.\.|\.\.\.)\))+/;

/** The same, everywhere in a string. A route holds one, but a `replace` needs its own. */
const INTERCEPTION_MARKERS = new RegExp(INTERCEPTION_MARKER, "g");

/**
 * One intercepted route in the build: the URL the reader presses, and the internal route
 * the intercepted render is filed under.
 *
 * `route` is the thing that matters and it is the *shared* one — the full page at
 * `/library/[entryId]/episode/[episodeId]` and the modal are two renders of one address,
 * which is the whole property #254 asks for. `intercepted` is the build's own bookkeeping
 * (`/(.)library/[entryId]/episode/[episodeId]`) and is not a URL anybody can request.
 */
export interface Interception {
  /** The reader's URL, in manifest form. */
  route: string;
  /** The internal route the rewrite points at. */
  intercepted: string;
}

/** Whether a route or a source path carries an interception marker. */
export function isIntercepted(path: string): boolean {
  return INTERCEPTION_MARKER.test(path);
}

/**
 * The URL an intercepted route is a second render of — the marker taken out.
 *
 * `/(.)library/[entryId]/episode/[episodeId]` → `/library/[entryId]/episode/[episodeId]`,
 * which is both the address the reader is at while the modal is open and the page a
 * refresh lands on. A route with no marker is returned unchanged, so this is safe to call
 * on anything.
 */
export function withoutInterception(route: string): string {
  return route.replace(INTERCEPTION_MARKERS, "");
}

/**
 * A trailing **optional** catch-all — `[[...rest]]` — and only a trailing one.
 *
 * Optional, so the double brackets are required: `[...rest]` matches one segment or more
 * and genuinely narrows a route, while `[[...rest]]` also matches *none* and therefore
 * does not.
 */
const TRAILING_OPTIONAL_CATCH_ALL = /\/\[\[\.\.\.[^\]]+\]\]$/;

/**
 * The URL an intercepted render **shadows** — the one a hard load has to land on.
 *
 * For most interceptions this is just the route with its marker removed, and this function
 * would not need to exist. It exists for the title sheet, whose intercepted segment is
 * `(.)library/[entryId]/[[...rest]]` while the route it shadows is `/library/[entryId]`.
 *
 * ── Why that segment is written with a catch-all at all ─────────────────────────────
 *
 * So the title sheet keeps matching when an episode sheet opens *over* it at
 * `/library/…/episode/…`, one segment deeper. Without it the segment stops matching there
 * and the sheet survives only as slot state the router happens to be retaining, which
 * `parallel-routes.md` promises for a soft navigation and for nothing else.
 *
 * An optional catch-all does not narrow what a route matches — `[[...rest]]` matches zero
 * segments as happily as three — so trimming it here is not the audit being made lenient.
 * It is the audit being told what URL the segment is *about*, which is the same URL it was
 * about before the catch-all was added. A **required** `[...rest]` is deliberately not
 * trimmed: that one would mean the sheet no longer opens at `/library/[entryId]` itself,
 * which is a real change and should fail this audit as `missing`.
 */
export function shadowedRoute(route: string): string {
  return withoutInterception(route).replace(TRAILING_OPTIONAL_CATCH_ALL, "");
}

/**
 * The interceptions the build compiled, read off its rewrites.
 *
 * A rewrite counts as one when all three hold: it is in `beforeFiles`, its destination
 * carries an interception marker, and its source is that destination with the marker taken
 * out. All three, because the point is to recognise the framework's own machinery
 * precisely enough that anything else falls through to `authoredRewriteCount` — a hand-
 * written rewrite that happened to mention a marker is not an interception, and treating
 * it as one would be this check exempting the thing it exists to notice.
 *
 * The `next-url` header condition is not part of the test here and is asserted separately,
 * in `tests/route-manifest.test.ts`: it is the property that makes a refresh render the
 * full page, and it deserves to fail under its own name rather than as *this rewrite was
 * not recognised.*
 */
export function interceptionsIn(rewrites: RoutesManifest["rewrites"]): Interception[] {
  return rewrites.beforeFiles
    .filter(
      (rewrite) =>
        isIntercepted(rewrite.destination) &&
        withoutInterception(rewrite.destination) === rewrite.source,
    )
    .map((rewrite) => ({
      // The manifest writes rewrite paths with `:name` parameters rather than the
      // manifest's own brackets, so both sides are put back into route form — this is the
      // one place the two spellings meet, and comparing them anywhere else would be
      // comparing `/library/:nxtPentryId` against `/library/[entryId]` and finding them
      // different every time.
      route: routeFromRewritePath(rewrite.source),
      intercepted: routeFromRewritePath(rewrite.destination),
    }));
}

/**
 * A rewrite path back into the form the route manifest writes.
 *
 * `next build` compiles `[entryId]` into the parameter name `:nxtPentryId` — its own
 * prefix, to keep an author's `:id` from colliding with a segment's. Undoing it here means
 * the audit compares routes with routes; the alternative is two vocabularies for one path
 * and a comparison that silently never matches.
 */
function routeFromRewritePath(path: string): string {
  return path
    .replace(/:nxtP\*(\w+)/g, "[[...$1]]")
    .replace(/:nxtP(\w+)\*/g, "[[...$1]]")
    .replace(/:nxtP(\w+)\+/g, "[...$1]")
    .replace(/:nxtP(\w+)/g, "[$1]");
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
  /** The URL pattern, as `routes-manifest.json` writes it — `/titles/[entryId]`. */
  route: string;
  /** The path under `app/` that owns it — `(signed-in)/titles/[entryId]`. */
  segment: string;
  /** Rendered on demand, rather than prerendered at build time. */
  dynamic: boolean;
  /**
   * The parallel slot this page renders into — `@modal` — or `null` for the implicit
   * `children` slot, which is every other page in the application.
   *
   * Read off the source path rather than the URL, because a slot is invisible in a URL by
   * construction. That is the whole reason this field exists: without it the intercepted
   * episode render and the full page are two rows that look identical, and *the slot has
   * disappeared* looks exactly like *nothing changed* (issue #254).
   */
  slot: string | null;
}

export interface BuildArtifacts extends RouteCoverageInput {
  assumptions: RoutingAssumptions;
  /** Every page in the build. Route handlers are not here — see `pageRoutes`. */
  pages: PageRoute[];
  /** The build's rewrites, as compiled. Read by the interception assertions, which check
   *  the `next-url` condition that makes a refresh land on the full page. */
  rewrites: RoutesManifest["rewrites"];
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
     * worse than no check — it is the shape of the empty-versus-failed rule one directory over.
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
    .map(([sourcePath, route]) => {
      // `/(signed-in)/library/page` → `(signed-in)/library`, and `/page` → `""`, which is
      // `app/` itself and is where `app/page.tsx` lives.
      const segment = sourcePath.slice(1, -PAGE_SUFFIX.length);

      return {
        route,
        segment,
        dynamic: !prerendered.has(route),
        slot: slotOf(segment),
      };
    });
}

/**
 * Which parallel slot a source path renders into, or `null` for `children`.
 *
 * One `@name` directory anywhere in the path is the slot. More than one would be a slot
 * inside a slot, which this application does not have and which this deliberately refuses
 * to guess about rather than silently reporting the first: a check that answers confidently
 * about a shape nobody has thought through is worse than one that stops.
 */
function slotOf(segment: string): string | null {
  const slots = segment.split("/").filter((part) => part.startsWith("@"));

  if (slots.length > 1) {
    throw new Error(
      `The page compiled from app/${segment} is inside ${slots.length} parallel slots ` +
        `(${slots.join(", ")}). Nested slots are a routing shape this check has never ` +
        "seen and does not know how to audit — tests/support/route-manifest.ts is what " +
        "has to be told about it.",
    );
  }

  return slots[0] ?? null;
}

/**
 * The routes a reader can actually navigate to, out of every route the build compiled.
 *
 * ── Why this subtraction exists ──────────────────────────────────────────────────────
 *
 * A parallel slot's pages are compiled as routes and land in the routes manifest looking
 * exactly like any other. They are not routes: a slot fills a *hole in a layout* at a URL
 * that some other page owns, so nobody can navigate to one, and the proxy has nothing to
 * gate. Auditing them for session protection asks a question they cannot answer.
 *
 * This became real with the two modal slots. Each closes itself on a soft navigation with
 * a `[...catchAll]/page.tsx` that returns `null` — the file `parallel-routes.md` requires,
 * without which an open dialog follows the reader to the next screen. Both compile to the
 * route `/[...catchAll]`, and the protection audit reported two unprotected routes that no
 * request will ever reach.
 *
 * **Only routes that exist *nowhere but* a slot are dropped.** `/` is compiled from
 * `app/page.tsx` *and* from `@title/page.tsx` and `@episode/page.tsx`; it stays, because
 * `children` owns it and a reader lands on it. That distinction is the whole function —
 * a blunter "drop anything a slot compiled" would silently stop auditing the home page.
 */
function navigableRoutes(
  routes: readonly string[],
  appPaths: AppPathRoutesManifest,
): string[] {
  const owned = new Set(
    Object.entries(appPaths)
      .filter(([sourcePath]) => slotOf(sourcePath) === null)
      .map(([, route]) => route),
  );

  return routes.filter((route) => owned.has(route));
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

  const interceptions = interceptionsIn(routes.rewrites);

  return {
    routes: navigableRoutes(
      [
        ...routes.staticRoutes.map((route) => route.page),
        ...routes.dynamicRoutes.map((route) => route.page),
      ],
      appPaths,
    ),
    matcher: matchers.map((matcher) => matcher.originalSource),
    pages: pageRoutes(
      appPaths,
      new Set([...Object.keys(prerender.routes), ...Object.keys(prerender.dynamicRoutes)]),
    ),
    assumptions: {
      basePath: routes.basePath,
      authoredRewriteCount:
        routes.rewrites.beforeFiles.length +
        routes.rewrites.afterFiles.length +
        routes.rewrites.fallback.length -
        interceptions.length,
      interceptions,
    },
    rewrites: routes.rewrites,
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
 * ── The interception marker is taken off rather than probed (issue #254) ────────────
 *
 * `/(.)library/[entryId]/episode/[episodeId]` is in the manifest, and it is not an address
 * anybody can type: it is the internal name of the *second render* of
 * `/library/[entryId]/episode/[episodeId]`, reached by a rewrite the framework applies
 * after the proxy has already run. So the URL to ask the gate about is the one the reader
 * actually requests, which is that route with the marker taken out.
 *
 * Dropping the row instead was the alternative and is worse: the intercepted render reads
 * the same account's library as the page it shadows, and a routing shape the coverage audit
 * cannot see is a routing shape somebody can add an unguarded read behind. Both rows now
 * probe the same URL, which is the truth — one address, two renders, one gate.
 *
 * Anything left over after substitution still throws. A `@slot` never reaches a URL, and
 * whatever Next adds next would otherwise be probed as a literal — a URL nobody can
 * request — and the matcher's answer about it would mean nothing while looking like a pass.
 */
export function probeUrlFor(route: string): string {
  const probe = withoutInterception(route)
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


/**
 * ── The modal-slot audit (issue #254) ────────────────────────────────────────────────
 *
 * Same shape as the two above: a reader off the source tree, then a pure function over
 * what the build said. What it protects is stated in `tests/route-manifest.test.ts` beside
 * the list it reads; what follows is only how it is computed.
 */

/** One route that must open as a modal, and everything the build has to have for it to. */
export interface ModalRoute {
  /** The reader's URL, in manifest form. */
  route: string;
  /** The slot the intercepted render belongs in. */
  slot: string;
}

export interface ModalAudit {
  /** Named as a modal route, and the build compiled no intercepted render of it. */
  missing: string[];
  /** Intercepted in the build, and nothing names it — a modal nobody decided on. */
  unnamed: string[];
  /** Intercepted into a slot other than the one named for it. */
  wrongSlot: string[];
  /** Intercepted, with no full page behind it — a modal over nothing on a refresh. */
  withoutFullPage: string[];
  /** In a slot with no `default`, which errors on every route that does not match it. */
  withoutDefault: string[];
}

/**
 * **Every named route opens as a modal, and every modal in the build is a named route.**
 *
 * Five lists rather than one, because they are five different mistakes and only the first
 * two look alike from a distance:
 *
 *  - `missing` is the slot having **disappeared** — the directory deleted, the marker
 *    misspelt, the interception silently stopping. The application still builds and still
 *    works; episode detail simply starts replacing the page the reader was on. This is the
 *    failure the ticket asks to be caught, and it is the reason this audit exists.
 *  - `unnamed` is a modal appearing that nobody wrote down.
 *  - `wrongSlot` is an interception filed under a slot the layout does not render, which
 *    is a modal that never appears — the same symptom as `missing`, a different cause, and
 *    a completely different fix.
 *  - `withoutFullPage` is #254's *opening the URL directly renders the full page* gone:
 *    an intercepted render with nothing behind it is a shareable link that 404s.
 *  - `withoutDefault` is the one that takes the **rest of the application** down rather
 *    than this feature: a named slot with no `default` errors on every URL it cannot
 *    match, which is every other page in the group.
 *
 * `hasDefault` is asked about the slot's own directory and is returned as a predicate for
 * `loadingBoundaryReader`'s reason — so the audit stays pure and its failure cases can be
 * handed a set written out by hand.
 */
export function auditModalSlots(
  pages: readonly PageRoute[],
  interceptions: readonly Interception[],
  expected: readonly ModalRoute[],
  hasDefault: (slot: string) => boolean,
): ModalAudit {
  /** The intercepted renders the build actually compiled, by the URL they shadow. */
  const intercepted = new Map(
    pages
      .filter((page) => isIntercepted(page.segment))
      .map((page) => [shadowedRoute(page.route), page]),
  );

  const missing: string[] = [];
  const wrongSlot: string[] = [];
  const withoutFullPage: string[] = [];
  const withoutDefault: string[] = [];

  for (const modal of expected) {
    const page = intercepted.get(modal.route);

    if (page === undefined) {
      missing.push(modal.route);
      continue;
    }

    if (page.slot !== modal.slot) wrongSlot.push(modal.route);
    if (!hasDefault(modal.slot)) withoutDefault.push(modal.route);

    /**
     * The full page, and it is asked of `pages` rather than of the rewrite: a rewrite
     * points at a destination whether or not anything is filed there, and the property is
     * that a hard load has somewhere to land. The `slot === null` is load-bearing — the
     * intercepted render serves the same URL, so without it every interception would find
     * *itself* and this list would never have anything in it.
     */
    const full = pages.some((one) => one.route === modal.route && one.slot === null);
    if (!full) withoutFullPage.push(modal.route);
  }

  const named = new Set(expected.map((modal) => modal.route));

  return {
    missing,
    /**
     * Read from the rewrites as well as the pages, so an interception that compiled a
     * rewrite but no page — and the reverse — is reported rather than halving the check.
     */
    unnamed: [
      ...new Set([
        ...intercepted.keys(),
        ...interceptions.map((one) => shadowedRoute(one.route)),
      ]),
    ]
      .filter((route) => !named.has(route))
      .sort(),
    wrongSlot,
    withoutFullPage,
    withoutDefault,
  };
}

/** Next's own name for a slot's fallback, in every extension it will load one from —
 *  `LOADING_BOUNDARY`'s reason, one convention over. */
const SLOT_DEFAULT = /^default\.(?:tsx|ts|jsx|js|mjs)$/;

/**
 * Whether a parallel slot has a `default`, read off the source tree under a route group.
 *
 * **The build cannot supply this.** A `default` serves no URL, so it appears in no
 * manifest — it is the file that renders when a slot matches *nothing*, which is the one
 * state no route table has a row for. So this is the loading-boundary audit's split again:
 * the build says which slots exist and what is filed in them, and this answers the one
 * remaining question against the directory the build named.
 *
 * A slot the build named and the source tree does not have throws rather than answering
 * `false`, for `readManifest`'s reason: the two have gone out of step, and reporting *no
 * default here* for a directory that is not there is reporting on nothing.
 */
export function slotDefaultReader(
  repositoryRoot: string,
  group: string,
): (slot: string) => boolean {
  return (slot) => {
    const directory = path.join(repositoryRoot, "app", group, slot);

    if (!existsSync(directory)) {
      throw new Error(
        `The build says a page was compiled into the ${slot} slot, and app/${group}/${slot} ` +
          "does not exist. The build and the source tree are not the same tree — rebuild " +
          "with `npm run build` before reading anything into this check's result.",
      );
    }

    return readdirSync(directory).some((entry) => SLOT_DEFAULT.test(entry));
  };
}
