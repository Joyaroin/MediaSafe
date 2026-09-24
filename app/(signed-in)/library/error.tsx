"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { LibraryHeading } from "./library-heading";

/**
 * The library did not load.
 *
 * ── Why this exists when `app/error.tsx` already does ────────────────────────────────
 *
 * `AGENTS.md` places errors by blast radius, and the first row of that table is *one
 * region failed to load → inline, replacing that region.* The root boundary would replace
 * the whole page, so the reader would be told that something failed without being told
 * that it was the library. This one keeps the heading and puts the failure where the grid
 * was — which is what #56 asks for in as many words: *it replaces the grid*.
 *
 * Nothing here is a second treatment. `errors/read-failure.tsx` draws it, exactly as the
 * root boundary and the sign-in surface do; this file only decides where it lands.
 *
 * ── The reference id ─────────────────────────────────────────────────────────────────
 *
 * `referenceForBoundary` is the derivation every boundary shares, and `errors/reference.ts`
 * holds both it and the reasoning: the id is the Sentry event id, the digest goes on as a
 * tag rather than being printed, and the whole thing is memoised on the error object so it
 * is safe to call while rendering. That last part matters here — `retry()` re-renders
 * *this* instance with a new `error` rather than remounting it, so an id seeded once at
 * mount would leave a reader quoting the reference for the failure before last.
 */
export default function LibraryReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3 — `retry` re-fetches and re-renders the segment, which for this screen
  // means running the library query again. It is not `reset`.
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <LibraryHeading />

      <div className="px-gutter">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
