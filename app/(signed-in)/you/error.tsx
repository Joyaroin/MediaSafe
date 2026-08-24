"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { YouHeading } from "./you-heading";

/**
 * You did not load — same shape as `lists/error.tsx` and `library/error.tsx`, for the
 * same reason: `AGENTS.md` places a failed region inline,
 * replacing that region, and the root boundary would swallow which surface failed.
 *
 * This is the boundary the whole page's error discipline points at. Every figure on `/you`
 * has a zero that would look entirely reasonable in its place — *no watch time, nothing
 * watched, nothing completed* is a perfectly ordinary thing for a page about a reader to
 * say — so *the read failed* has to be a visibly different screen rather than a quieter
 * version of the same one: left-aligned, `accent`, ruled, and carrying a reference id,
 * against an empty state that is centred, unruled and carries none.
 *
 * **The hero is absent here, and that is the honest rendering.** A client boundary has no
 * session, so the name and avatar it would draw are not available to it — and inventing a
 * hero for a screen that failed would put the reader's own face over an error. The heading
 * is what says which destination this is.
 */
export default function YouReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <YouHeading />

      <div className="px-6 lg:px-10">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
