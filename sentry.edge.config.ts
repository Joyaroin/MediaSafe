import * as Sentry from "@sentry/nextjs";

/**
 * Sentry on the edge runtime — middleware, and anything else Next.js runs there.
 *
 * The middleware matcher over the route manifest (`SPEC.md` §6, build step 1) runs on this
 * runtime, and an auth check that throws unreported is the one failure that would lock the
 * owner out of their own library with nothing to read back.
 *
 * Kept in step with `sentry.server.config.ts`: same DSN discipline, no tracing.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
