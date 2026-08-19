"use client";

import { useParams } from "next/navigation";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { BackToTitle, RemoveTitleHeading } from "./remove-frame";

/**
 * The counts did not load — and so there is nothing on this page to confirm.
 *
 * ── This boundary is an acceptance criterion, not tidiness ───────────────────────────
 *
 * Issue #142: *a read failure on the counts shows a read failure with no confirmation under
 * it — never a zero.* `titleFootprint` throws rather than returning zeroes, which is the
 * `AGENTS.md` rule everywhere; what this file adds is where that throw lands. Without it the
 * failure would reach the library's boundary or the root's, and the reader would be told
 * something failed without being told it was the thing they came here to read.
 *
 * **What matters most is what is not below.** There is no remove button on this surface. A
 * page that could not count a title's watches must not offer to destroy them, and the way
 * to guarantee that is for the failing render to have no form in it at all rather than for a
 * form to be conditionally hidden.
 *
 * ── It catches a missing entry too, and that is the right treatment ──────────────────
 *
 * `titleFootprint` throws the same way for a tampered id, another account's entry, and a
 * title already removed in another tab — `db/access.ts` explains why those are one case.
 * All of them land here, which is correct: from this page they are indistinguishable, and
 * *this did not load* with a way back to the library is the honest thing to say about every
 * one of them. Guessing between them would mean telling one reader their title is gone and
 * another that it never existed, on no evidence either way.
 *
 * Nothing here is a second treatment: `errors/read-failure.tsx` draws it, exactly as the
 * root boundary and the library's do. This file only decides where it lands and what stands
 * beside it — the heading, so the reader knows which page failed, and the way back, because
 * `retry()` is not the only thing somebody in this position wants.
 */
export default function RemoveTitleReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3 — `retry` re-fetches and re-renders the segment, which here means running
  // the count again. It is not `reset`.
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);
  /**
   * A dynamic segment can come back as a string, an array, or not at all — `BackToTitle`
   * takes `undefined` and points at the library instead, which is where a reader whose read
   * just failed can actually see whether the title is still there.
   */
  const entryId = useParams()?.entryId;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <RemoveTitleHeading />

      <div className="mt-8">
        <ReadFailure reference={reference} retry={retry} />
      </div>

      <BackToTitle entryId={typeof entryId === "string" ? entryId : undefined} />
    </main>
  );
}
