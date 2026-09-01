"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { BackToLibraryBar } from "./back-to-library-bar";

/**
 * Title detail did not load, on the phone route. `app/(signed-in)/library/error.tsx`
 * keeps the same shape for the grid; this is the segment boundary for `[entryId]`, and
 * exists for the identical reason: the root boundary (`app/error.tsx`) would replace the
 * whole page, telling a reader something failed without telling them what.
 *
 * The back link stays on screen through the failure — a route that failed to load is
 * still a route you should be able to leave, and `Library` is where every path into this
 * one starts from.
 */
export default function TitleDetailReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <BackToLibraryBar />

      <div className="px-6 py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
