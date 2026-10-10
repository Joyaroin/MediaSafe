import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { carriesSessionCookie } from "@/lib/session-cookie";

/**
 * Constraint 5, in one file: **no unauthenticated route may ever be added**. Every route in this application is behind a session except four, and the four are
 * written out below rather than implied.
 *
 * The rule was once justified by previews carrying a copy of the real library.
 * That justification is gone — #18 made the preview branch
 * schema-only, holding zero production rows — and that **the rule did not go with it**.
 * It binds every remaining step of the build order, and it is the reason
 * `tests/route-manifest.test.ts` exists.
 *
 * ── `proxy.ts`, not `middleware.ts` ──────────────────────────────────────────────────
 *
 * Next 16 renamed the file convention and the exported function; `middleware.ts` is
 * deprecated (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * Everything else about it is unchanged, which is why issue #43 and
 * `eslint.config.mjs` both still say *middleware matcher* — the name in the ticket and the
 * name on disk are one Next.js release apart.
 *
 * ── A third exemption, issue #115 ────────────────────────────────────────────────────
 *
 * `api/cron/nightly-sweep$` is the nightly metadata sweep's cron route. Vercel's cron
 * sends no session cookie, so behind this matcher unexempted it would be redirected to
 * sign-in and the refresh would silently never run — the exact failure the sweep
 * exists to prevent. **It is un-sessioned, not unauthenticated**: the route checks a
 * bearer `CRON_SECRET` itself and rejects anything without it
 * (`app/api/cron/nightly-sweep/route.ts`). This comment says so precisely because the
 * list below must never read as four unprotected routes.
 *
 * ── This is a gate, not the authorization ────────────────────────────────────────────
 *
 * It reads a cookie. It does not read the session table, and it must not: Next's own
 * guidance is that proxy is for optimistic checks rather than session management, and a
 * database query in front of every request to every route is a cost paid on the assets
 * too. A request carrying any plausible cookie gets past this line and lands on a page
 * that calls `requireUserId()`, which queries, and which redirects if the answer is
 * nobody. That is the check with teeth.
 *
 * **Be exact about what that leaves.** A route that forgets to call `requireUserId()` is
 * not saved by this. `carriesSessionCookie()` tests for presence, not validity, so anyone
 * who sends `better-auth.session_token=anything` is past this line — and no static check
 * can see a missing `requireUserId()` in a page's body. What the gate buys is narrower and
 * still worth having: a reader with **no** cookie — a search engine, a shared link, an
 * expired browser — never reaches the route at all, and every route is in that position
 * unless the matcher is widened in a diff someone can see.
 *
 * The page-level check is not redundant with this and never becomes so.
 *
 * ── A fourth, issue #366 ─────────────────────────────────────────────────────────────
 *
 * `api/calendar/[^/]+$` is the reader's calendar feed. A calendar app subscribing to a URL
 * cannot sign in and sends no cookie. Like the sweep it is un-sessioned rather than
 * unauthenticated: the path's last segment is a per-user secret token, which the route
 * looks up itself and answers 404 without (`app/api/calendar/[feed]/route.ts`).
 */
export function proxy(request: NextRequest): NextResponse {
  if (carriesSessionCookie(request)) return NextResponse.next();

  /**
   * To sign-in, and nowhere else. No `?next=` and no return path: nothing in the app
   * links a signed-out reader at a protected route, so the only way to be here is to have
   * typed one or to have had a session end, and neither wants a query parameter carrying
   * a path back into the redirect. When there is a surface worth returning to — the
   * library, at build step 2 — that is the change to make, deliberately.
   */
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

/**
 * **The matcher, and the four exemptions, as one literal.**
 *
 * It has to be a literal, and Next enforces that itself: a matcher assembled from
 * variables fails the build with *Entry `matcher[0]` need to be static strings or static
 * objects*. Verified by writing one and watching the build refuse, rather than taken from
 * the documentation, which only says computed values are ignored. That message comes out
 * of Turbopack, so it lives in the native `next-swc` binary under `node_modules/@next` and
 * in no `.js` file at all — grepping the JavaScript for it finds nothing and proves
 * nothing.
 *
 * **Four exemptions and one exclusion**, which are different things. An exemption is a
 * route a reader may reach without a session, and there are four. The exclusion is not a
 * route at all.
 *
 *  - **`sign-in$`** — the sign-in route. Anchored, so `/sign-in/anything` is covered
 *    rather than exempt: a future route under that prefix is protected by default.
 *  - **`api/auth(?:$|/)`** — Better Auth's own handler routes. The OAuth callback Google
 *    redirects to is here, and a session cannot exist until it has run, so gating it
 *    would make signing in impossible. Anchored the same way, so `/api/authorize` is
 *    covered.
 *  - **`api/cron/nightly-sweep$`** — issue #115's nightly metadata sweep. Vercel's cron
 *    sends no session cookie, and this route checks a bearer `CRON_SECRET` itself rather
 *    than relying on this gate — see the note above. Anchored with `$` alone, not
 *    `(?:$|/)`: the route has no sub-paths, so a future one would not inherit this
 *    exemption by accident the way `api/auth`'s deliberately lets its children.
 *  - **`api/calendar/[^/]+$`** — issue #366's calendar feed, one segment and no deeper:
 *    `/api/calendar` itself and anything two levels down stay covered. The route checks its
 *    token itself, as above.
 *  - **`_next/`** — the exclusion. The compiled bundles, the image optimiser, the build
 *    output. Nothing in the route manifest maps under this prefix, and
 *    `tests/route-manifest.test.ts` asserts that rather than trusting this sentence, so
 *    the clause cannot start hiding a route later. It is here because a matcher without
 *    it redirects the JavaScript and CSS of the sign-in page to the sign-in page, and the
 *    sign-in page is the one surface a signed-out reader is meant to reach.
 *
 * **`/icon.svg` is a route, and it is covered**, so a signed-out reader gets no tab icon
 * on the sign-in page. A known cost, taken deliberately: the alternative is a fourth
 * exemption in the ticket that exists to make a fourth exemption hard, and a missing
 * favicon is a smaller price than the rule being negotiable on the day it is written. If
 * that trade is wrong, it is a product decision, and it is not this file's to make.
 */
export const config = {
  matcher: [
    "/((?!_next/|sign-in$|api/auth(?:$|/)|api/cron/nightly-sweep$|api/calendar/[^/]+$).*)",
  ],
};
