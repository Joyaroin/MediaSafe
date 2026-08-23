"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { StatsHeading } from "./stats-heading";

/**
 * Stats did not load — same shape as `lists/error.tsx` and `library/error.tsx`, for the same
 * reason: `AGENTS.md` places a failed region inline, replacing that region, and the root
 * boundary would swallow which surface failed.
 *
 * This is the boundary the whole page's error discipline points at. Every figure on `/stats`
 * has a zero that would look entirely reasonable in its place, so *the read failed* has to be
 * a visibly different screen rather than a quieter version of the same one — left-aligned,
 * `accent`, ruled, and carrying a reference id, against an empty state that is centred,
 * unruled and carries none.
 */
export default function StatsReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <StatsHeading />

      <div className="px-6">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
