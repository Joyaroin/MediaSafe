"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
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
 * ── The reference id, and why it is read during render ───────────────────────────────
 *
 * `referenceFor` is memoised on the error object, so the id is the Sentry event id and the
 * same failure answers with the same id however many times it is asked. `retry()`
 * re-renders *this* instance with a new `error` rather than remounting it, so state seeded
 * once at mount would leave a reader quoting the reference for the failure before last.
 * `app/error.tsx` carries the long version of this reasoning.
 *
 * A Server Component render that throws arrives here stripped of its stack — React leaves
 * a generic message and a `digest`. Tagging this event with that digest is what joins it
 * to the server-side event `instrumentation.ts` sent, so the id the reader quotes leads to
 * an event that names its server half.
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
  const reference = referenceFor(
    error,
    error.digest ? { digest: error.digest } : undefined,
  );

  return (
    <main className="flex w-full flex-1 flex-col">
      <LibraryHeading />

      <div className="px-6">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
