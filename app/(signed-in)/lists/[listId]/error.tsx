"use client";

import Link from "next/link";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";

/**
 * A list did not load. The segment boundary for `[listId]` — same shape as
 * `library/[entryId]/error.tsx`: the root boundary (`app/error.tsx`) would replace the
 * whole page rather than saying which surface failed, and `lists/error.tsx` covers the
 * index but not a row's own contents underneath it.
 *
 * The back link stays on screen through the failure, same reasoning as the title-detail
 * boundary: a list that failed to load is still a page you should be able to leave.
 */
export default function ListDetailReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="border-b border-hair px-6 py-4">
        <Link
          href="/lists"
          className="code-line text-dim underline decoration-hair underline-offset-4 transition-colors hover:text-text"
        >
          ‹ Lists
        </Link>
      </div>

      <div className="px-6 py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
