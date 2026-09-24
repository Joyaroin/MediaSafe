"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { ListsHeading } from "./lists-heading";

/**
 * The Lists destination did not load — same shape as `library/error.tsx`, for the same
 * reason: `AGENTS.md` places a failed region inline, replacing that region, and the root
 * boundary would swallow which surface failed. Keeping the heading here is what makes a
 * failed read visibly *Lists, which did not load* rather than a bare error on a blank page.
 */
export default function ListsReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <ListsHeading />

      <div className="px-gutter">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
