"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { ComingUpHeading } from "./coming-up-heading";

/**
 * Coming up did not load — inline, under this screen's own heading, the shape every
 * destination's boundary has. A failed read here must never be mistaken for
 * `UpcomingNothing`'s *no release dates yet*.
 */
export default function ComingUpReadFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reference = referenceForBoundary(error);

  return (
    <main className="flex w-full flex-1 flex-col">
      <ComingUpHeading />

      <div className="px-gutter py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
