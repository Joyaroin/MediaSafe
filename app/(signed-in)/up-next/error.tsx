"use client";

import { ReadFailure } from "@/errors/read-failure";
import { referenceForBoundary } from "@/errors/reference";
import { TIMEZONE_FALLBACK } from "@/lib/timezone";
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
 *
 * ── The heading's word here uses `TIMEZONE_FALLBACK`, not the account's zone ──────────
 *
 * Next.js requires an error boundary to be a Client Component, and `requireTimezone()`
 * reaches through `next/headers` — a Server Component-only door `page.tsx` and
 * `loading.tsx` can still knock on, and this file structurally cannot. `TIMEZONE_FALLBACK`
 * is `lib/timezone.ts`'s own answer to *no zone is reachable*, reused rather than a device
 * clock read (which issue #319 rules out by name) or a second fallback invented beside it.
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
      <UpNextHeading zone={TIMEZONE_FALLBACK} at={new Date()} />

      <div className="px-6 py-5">
        <ReadFailure reference={reference} retry={retry} />
      </div>
    </main>
  );
}
