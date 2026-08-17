"use client";

import { createAuthClient } from "better-auth/react";

/**
 * The browser half of Better Auth: the two calls the reader can actually make.
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
 * outside `lib/` reaches auth through *this* file.
 *
 * ── No `baseURL` ─────────────────────────────────────────────────────────────────────
 *
 * Left unset on purpose, so the client calls the origin the page was served from. Setting
 * it would mean baking one origin into the browser bundle, and the app is served from
 * three: `localhost` in development, a per-deployment domain on every Vercel preview, and
 * the production domain. A preview that posted its sign-in to production would be a
 * confusing bug and a real one.
 */
export const authClient = createAuthClient();
