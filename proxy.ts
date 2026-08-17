import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { carriesSessionCookie } from "@/lib/session-cookie";

/**
 * Constraint 5, in one file: **no unauthenticated route may ever be added** (`SPEC.md`
 * §3). Every route in this application is behind a session except two, and the two are
 * written out below rather than implied.
 *
 * `PRODUCT.md` justified this rule with previews carrying a copy of the real library.
 * `SPEC.md` §10.4 records that the justification is gone — #18 made the preview branch
 * schema-only, holding zero production rows — and that **the rule did not go with it**.
 * It binds every remaining step of the build order, and it is the reason
 * `tests/route-manifest.test.ts` exists.
 *
 * ── `proxy.ts`, not `middleware.ts` ──────────────────────────────────────────────────
 *
 * Next 16 renamed the file convention and the exported function; `middleware.ts` is
 * deprecated (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * Everything else about it is unchanged, which is why `SPEC.md` §6, issue #43 and
 * `eslint.config.mjs` all still say *middleware matcher* — the name in the spec and the
 * name on disk are one Next.js release apart, and the spec is not being rewritten for it.
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
 * What this buys is that a route which *forgot* to call `requireUserId()` still cannot be
 * read by a signed-out stranger — and, with the static test, that a route which forgets
 * cannot be added at all without the matcher being widened in a diff someone can see.
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
 * **The matcher, and the two exemptions, as one literal.**
 *
 * It has to be a literal, and Next enforces that itself: a matcher assembled from
 * variables fails the build with *Entry `matcher[0]` need to be static strings or static
 * objects*. Verified by writing one and watching the build refuse, rather than taken from
 * the documentation, which only says computed values are ignored.
 *
 * Read it as: everything, except three things.
 *
 *  - **`sign-in$`** — the sign-in route. Anchored, so `/sign-in/anything` is covered
 *    rather than exempt: a future route under that prefix is protected by default.
 *  - **`api/auth(?:$|/)`** — Better Auth's own handler routes. The OAuth callback Google
 *    redirects to is here, and a session cannot exist until it has run, so gating it
 *    would make signing in impossible. Anchored the same way, so `/api/authorize` is
 *    covered.
 *  - **`_next/`** — the compiled bundles, the image optimiser, the build output. These
 *    are not routes; nothing in the route manifest maps to them, so the static test never
 *    sees them and this clause widens nothing it checks. It is here because a matcher
 *    without it redirects the JavaScript and CSS of the sign-in page to the sign-in page,
 *    and the sign-in page is the one surface a signed-out reader is meant to reach.
 *
 * Two exemptions, not three: `/icon.svg` is a real route in the manifest and it is
 * **covered**, so a signed-out reader gets no tab icon on the sign-in page. That is a
 * known and accepted cost. The alternative is a third exemption in the ticket that exists
 * to make a third exemption hard, and a missing favicon is a smaller price than the rule
 * being negotiable on the day it is written.
 */
export const config = {
  matcher: ["/((?!_next/|sign-in$|api/auth(?:$|/)).*)"],
};
