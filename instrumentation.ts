import * as Sentry from "@sentry/nextjs";

/**
 * Server-side instrumentation. Next.js calls `register()` once per server instance,
 * before the first request is handled.
 *
 * The two runtimes are imported dynamically and separately because they are different
 * builds of the SDK — the edge one has no Node.js integrations and importing it on the
 * Node.js runtime, or the reverse, initialises the wrong client.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Every error Next.js catches on the server, reported with the request that caused it.
 *
 * This is the half of the story the reader never sees. When a Server Component render
 * throws, React replaces the error before it reaches the browser: `app/error.tsx` gets a
 * generic message and a `digest`, and no stack. The event this hook sends is the one with
 * the stack in it, and `app/error.tsx` tags its own event with the same `digest` — so the
 * reference id a reader reads back leads to an event that names the server event it came
 * from. See the note in `app/error.tsx`.
 */
export const onRequestError = Sentry.captureRequestError;
