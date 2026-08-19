"use client";

import Link from "next/link";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * The counts did not load — and so there is nothing on this page to confirm.
 *
 * ── This boundary is an acceptance criterion, not tidiness ───────────────────────────
 *
 * Issue #125: *a count that cannot be read is a read failure on this page, never a zero.*
 * `accountFootprint` throws rather than returning zeroes, which is the `AGENTS.md` rule
 * everywhere; what this file adds is where that throw lands. Without it the failure would
 * reach the root boundary, which replaces the whole page — the reader would be told
 * something failed without being told it was the thing they came here to read.
 *
 * **What matters most is what is not below.** There is no confirmation field and no
 * delete button on this surface. A page that could not count an account's rows must not
 * offer to destroy them, and the way to guarantee that is for the failing render to have
 * no form in it at all rather than for a form to be conditionally hidden.
 *
 * Nothing here is a second treatment: `errors/read-failure.tsx` draws it, exactly as the
 * root boundary and the library's do. This file only decides where it lands and what
 * stands beside it — the heading, so the reader knows which page failed, and the way back
 * to Settings, because `retry()` is not the only thing someone in this position wants.
 *
 * `referenceForBoundary` is the derivation every boundary shares; `errors/reference.ts`
 * holds the reasoning, including why it is safe to call while rendering.
 */
export default function DeleteAccountReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3 — `retry` re-fetches and re-renders the segment, which here means
  // running the three counts again. It is not `reset`.
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <h1 className="bill-title text-bill-lg text-stock">Delete account</h1>

      <div className="mt-8">
        <ReadFailure reference={reference} retry={retry} />
      </div>

      <p className="mt-8 text-item text-stock-dim">
        <Link
          href="/settings"
          className="underline decoration-rule-bold underline-offset-4 transition-colors duration-150 hover:text-stock"
        >
          ‹ Back to Settings
        </Link>
      </p>
    </main>
  );
}
