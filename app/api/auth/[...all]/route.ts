/* eslint-disable no-restricted-imports --
 * Both imports below, and the whole file's reason for existing: this is where Better
 * Auth's own HTTP endpoints are mounted. The restriction exists so that no *page*
 * resolves its own session or builds a second instance, and this route does neither — it
 * hands every request straight to Better Auth. It is the second and last module allowed
 * to reach `lib/auth.ts`; `lib/session.ts` is the first.
 */
import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

/**
 * Better Auth's own endpoints — sign-in, the Google callback, sign-out, session — under
 * `/api/auth`. Everything Better Auth needs a URL for is here and nowhere else.
 *
 * ── Why the handler is wrapped rather than passed ────────────────────────────────────
 *
 * `toNextJsHandler(auth)` is the documented form and it would build the instance at
 * module scope. `lib/auth.ts` explains at length why that must not happen: the instance
 * resolves the connection pool as it initialises, and this module is in the graph
 * `next build` walks — including in CI, which has no `DATABASE_URL` and no secret on
 * purpose. The function form of `toNextJsHandler` takes a request handler instead, so
 * `getAuth()` runs on the first request rather than on the first import.
 *
 * ── Only GET and POST ────────────────────────────────────────────────────────────────
 *
 * `toNextJsHandler` also returns PATCH, PUT and DELETE. Better Auth's endpoints are GET
 * and POST, so exporting the other three would mount three methods that exist only to
 * answer 404 from further inside — and, on a route this exposed, three more doors than
 * the app has reasons for.
 */
export const { GET, POST } = toNextJsHandler((request: Request) =>
  getAuth().handler(request),
);
