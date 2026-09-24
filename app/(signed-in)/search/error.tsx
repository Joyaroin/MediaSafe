"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { SearchHeading } from "./search-heading";

/**
 * Search did not load — issue #302, and the only tab route this was missing on.
 *
 * `AGENTS.md` places a failed read inline, replacing that region, and the root boundary
 * (`app/error.tsx`) would replace the whole page — masthead, sidebar and tab bar included —
 * telling a reader something failed without telling them it was search, and taking away the
 * one control (the tab bar) that would let them leave for a screen that still works. Keeping
 * `SearchHeading` here is what makes a failed read visibly *Search, which did not load*
 * rather than a bare error on a blank page.
 *
 * `requireUserId()` (`page.tsx`) is this route's own read, and the one thing on this screen
 * that can be down independently of the reader's own connection — everything else on
 * `SearchSurface` is client state or a Server Action that reports its own failure inline
 * (`search-surface.tsx`'s `search()`, `rail-read-failure.tsx`), which is why neither of
 * those routes its errors up to this boundary.
 *
 * `referenceForBoundary` is the derivation every boundary in this application shares —
 * `errors/reference.ts` holds the reasoning for the digest tag and the memoisation that
 * keeps `retry()` from minting a second id for the same failure.
 */
export default function SearchReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-gutter pt-5 pb-12 lg:pb-16">
      <SearchHeading />

      <div className="mt-6">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
