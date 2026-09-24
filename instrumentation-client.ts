import * as Sentry from "@sentry/nextjs";

/**
 * Sentry in the browser, initialised before the app becomes interactive.
 *
 * It has to be initialised this early because `app/error.tsx` calls
 * `Sentry.captureException` while rendering a failure, and the id it gets back is the
 * reference id printed on screen. An SDK that had not started yet would hand back an id
 * for an event that was never sent — a technical string that resolves to nothing, which is
 * worse than no reference at all.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` rather than `SENTRY_DSN`: this file is bundled and served, so
 * the value is public by construction. A Sentry DSN is designed to be — it grants
 * event submission and nothing else.
 *
 * No session replay and no tracing. Sentry is here for errors; replay would record one
 * person's private library, in a product whose whole premise is that nobody else sees it.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
