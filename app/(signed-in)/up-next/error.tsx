"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { UpNextHeading } from "./up-next-heading";

/**
 * Up next did not load. The same shape `app/(signed-in)/library/error.tsx` and
 * `app/(signed-in)/titles/[entryId]/error.tsx` already use, for the identical reason:
 * `app/error.tsx` would replace the whole page, telling a reader something failed without
 * telling them it was the deck.
 *
 * This is the surface `AGENTS.md`'s rule bites hardest on: a failed read here must never
 * be mistaken for `UpNextEmpty`'s *you're caught up* — the exact failure `tvtracker`
 * shipped for its whole life, on the one screen this app opens on.
 */
export default function UpNextReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <UpNextHeading />

      <div className="px-6 py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
