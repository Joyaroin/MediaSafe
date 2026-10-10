import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces the minimal server bundle copied into the production container.
  output: "standalone",
  // The cache lives in Valkey (`cache-handler.mjs`), so a `revalidateTag` on one pod is seen
  // by every pod. Without VALKEY_URL — local development, CI — the handler caches nothing.
  cacheHandler: require.resolve("./cache-handler.mjs"),
  // A per-pod copy in front of Valkey would bring back the disagreement it removes.
  cacheMaxMemorySize: 0,
};

/**
 * `withSentryConfig` does the build-time half: it wires the SDK into the server and client
 * bundles and uploads source maps, without which every production stack trace is minified
 * and the reference id leads to an event nobody can read.
 *
 * The upload needs `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` (all in
 * `.env.example`; in the image build they are `image.yml`'s Actions variables and secret).
 * Without them the build still succeeds and simply
 * skips the upload — which is what a local `npm run build` does, and what a fork's build
 * would do.
 */
export default withSentryConfig(nextConfig, {
  // The build log is a place a real failure has to be visible. `silent` while CI is
  // running would hide a source-map upload that quietly stopped working.
  silent: !process.env.CI,
});
