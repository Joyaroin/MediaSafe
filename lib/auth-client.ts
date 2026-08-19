"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * The browser half of Better Auth: the calls the reader can actually make.
 *
 * It talks to `/api/auth/*` over HTTP like any other client would. It holds no secret and
 * no session — the session is the cookie, and the row behind it — so nothing here is a
 * second source of truth about who is signed in. Server components ask `lib/session.ts`;
 * this is only how a click becomes a request.
 *
 * ── Why the sign-in control does not talk to `lib/auth.ts` ───────────────────────────
 *
 * It cannot. That module holds the secret, the Google credentials and the database pool,
 * and importing it from a client component would be a build error at best. This is the
 * separation Better Auth is built around, and `eslint.config.mjs` restates it: everything
 * outside `lib/` reaches auth through *this* file — and the `lib/auth` specifier stays
 * restricted even from in here, so this plugin is told `timezone`'s shape by hand below
 * rather than by importing `authOptions`'s type.
 *
 * ── `inferAdditionalFields`, and why its schema is written out again ─────────────────
 *
 * Without it, `authClient.updateUser({ timezone })` does not typecheck: the client has no
 * way to know `timezone` exists unless told, and untold, `timezone-control.tsx` would
 * need a cast to call the one update path issue #126 asks it to use. The alternative —
 * `inferAdditionalFields<typeof authOptions>()` — reads the shape off `lib/auth.ts`
 * directly and would need no second copy, but it needs the type of `authOptions` to do
 * it, and that is `@/lib/auth`, restricted here on purpose. Naming the one field this
 * client actually sends (`type: "string"`) is the smaller duplication, and it only drifts
 * if `timezone`'s *type* changes, which changing what can be stored in it does not.
 *
 * ── No `baseURL` ─────────────────────────────────────────────────────────────────────
 *
 * Left unset on purpose, so the client calls the origin the page was served from. Setting
 * it would mean baking one origin into the browser bundle, and the app is served from
 * three: `localhost` in development, a per-deployment domain on every Vercel preview, and
 * the production domain. A preview that posted its sign-in to production would be a
 * confusing bug and a real one.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { timezone: { type: "string" } } })],
});
