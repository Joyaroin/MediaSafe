import * as Sentry from "@sentry/nextjs";

/**
 * Sentry on the Node.js runtime, loaded by `instrumentation.ts`'s `register()`.
 *
 * Sentry is here and nothing else is asked of it: this is error reporting, not
 * observability. Tracing and profiling are off — every span this app could produce is one
 * person's page load, and the free tier's quota is better spent on the errors an owner
 * actually reads back a reference id for.
 *
 * With no `SENTRY_DSN` the SDK initialises and sends nothing, which is the wanted
 * behaviour locally. `errors/reference.ts` notices and shows no reference id rather than
 * one that resolves to nothing.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // No performance monitoring. See above — this is deliberate, not a placeholder.
  tracesSampleRate: 0,

  // The one identifier a reader ever sees is the event id, so it has to be readable back
  // over a support conversation rather than buried under duplicates of the same error.
  sendDefaultPii: false,
});
