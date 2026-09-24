import { PendingLine } from "@/app/pending-line";
import { SearchHeading } from "./search-heading";

/**
 * Search, which is still reading — issue #302.
 *
 * Radius 1: `loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure — the same `<main>`, the same `SearchHeading`, and one pending
 * shape where `ReadFailure` would be.
 *
 * `held`, on the same reasoning every other radius-1 boundary in this ticket carries it:
 * `route-pending-hold` keeps this invisible for `--dur-pending-hold`, so a fast navigation
 * lands straight on the field rather than flashing a placeholder for a fifth of a second. A
 * genuinely slow connection still shows it, which is the freeze this ticket replaces.
 *
 * `form`, not `line`: the populated screen's own first content is `KindModeControl` over
 * `SearchField` — a control over a wide well — which is `form`'s own shape, read off the
 * type ramp rather than picked to look like anything more specific. The introductory
 * sentence and the *because you watched* rail are both omitted, for `you-heading.tsx`'s own
 * reason its hero is: neither is available yet at this boundary, and reserving space
 * for something that has not resolved is forbidden.
 */
export default function SearchLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-[22px] pt-5 pb-12 lg:pb-16">
      <SearchHeading />

      <div className="mt-6">
        <PendingLine shape="form" held />
      </div>
    </main>
  );
}
