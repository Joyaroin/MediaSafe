"use client";

import { BackToListsBar } from "@/app/(signed-in)/lists/back-to-lists-bar";
import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * Title detail did not load, for a title you do not own. The segment boundary for this
 * route, and it exists for the reason `library/[entryId]/error.tsx` exists: the root
 * boundary (`app/error.tsx`) would replace the whole page, telling a reader something
 * failed without telling them what.
 *
 * The back link stays on screen through the failure — a route that failed to load is
 * still a route you should be able to leave, and a list is where every path into this one
 * starts.
 */
export default function UnownedTitleReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToListsBar />

      <div className="px-6 py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
