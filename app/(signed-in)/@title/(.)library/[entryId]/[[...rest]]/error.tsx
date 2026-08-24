"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * A title detail read that failed, inside the sheet — `AGENTS.md`'s blast-radius table,
 * *one region failed to load* → inline, replacing that region. The region is the dialog;
 * the library underneath is untouched and still correct.
 */
export default function InterceptedTitleReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <div className="px-6 py-5">
      <ReadFailure reference={reference} retry={retry} />
    </div>
  );
}
