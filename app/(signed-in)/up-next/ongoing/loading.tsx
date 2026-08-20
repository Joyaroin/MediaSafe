import { PendingLine } from "@/app/pending-line";
import { GroupHeading } from "../group-screen";

/**
 * ONGOING's own screen, still reading — issue #181.
 *
 * This file exists because a boundary above it would speak for it: without it,
 * `up-next/loading.tsx` is the nearest boundary and this route would show *Tonight* over
 * one group's own page. `GroupHeading`'s label is a literal passed at each of its six call
 * sites, not a read, so it renders at once — the identical formula `group-screen.tsx`'s own
 * grid follows, less the grid.
 */
export default function OngoingGroupLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <GroupHeading label="Ongoing" />

      <div className="px-4 py-5">
        <PendingLine />
      </div>
    </main>
  );
}
