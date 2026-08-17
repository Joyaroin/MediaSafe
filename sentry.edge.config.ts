import * as Sentry from "@sentry/nextjs";

/**
 * Sentry on the edge runtime.
 *
 * **Nothing in this application runs there today.** This file was written expecting the
 * route matcher to, and it does not: Next 16 renamed middleware to Proxy and moved it to
 * the Node.js runtime, which the build confirms — `/_middleware` in
 * `.next/server/functions-config-manifest.json` compiles with `"runtime": "nodejs"`. So
 * the gate in `proxy.ts` reports through `sentry.server.config.ts` with everything else,
 * and `instrumentation.ts` never imports this file.
 *
 * It stays because the edge runtime is still a thing Next.js can put code on, and a
 * config that exists reports the first error from the first thing that lands there.
 *
 * Kept in step with `sentry.server.config.ts`: same DSN discipline, no tracing.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
