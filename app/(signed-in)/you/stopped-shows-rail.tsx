"use client";

import { useState } from "react";

import { resumeAction } from "@/app/(signed-in)/library/give-up-action";
import { SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import type { LibraryStateGroupEntry } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { startAgain, type ResumeOutcome } from "./start-again";
import { YouRail } from "./you-rail";
import { YouTitleTile } from "./you-title-tile";

/**
 * You's *Shows you stopped* rail — issue #373. `YouRail`'s shell and `YouTitleTile`'s tile,
 * unchanged, with *Start again* beneath each. The press is `start-again.ts`: optimistic,
 * through the existing resume action, and a lost write puts the tile back with one toast.
 *
 * Absent when there is nothing to show, `YouRail`'s own rule — including the moment the
 * last tile leaves on a press.
 */
export function StoppedShowsRail({ entries }: { readonly entries: readonly LibraryStateGroupEntry[] }) {
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [raised] = useState(() => new Map<string, WriteFailureHandle>());

  const deps = {
    resume,
    failures: writeFailures,
    raised,
    hide: (id: string) => setGone((before) => new Set(before).add(id)),
    restore: (id: string) =>
      setGone((before) => {
        const after = new Set(before);
        after.delete(id);
        return after;
      }),
  };

  return (
    <YouRail
      label="Shows you stopped"
      entries={entries.filter((entry) => !gone.has(entry.libraryEntryId))}
      keyFor={(entry) => entry.libraryEntryId}
      renderItem={(entry, aboveFold) => (
        <div className="flex w-[132px] flex-col gap-2">
          <YouTitleTile entry={entry} kind="show" aboveFold={aboveFold} />
          <button
            type="button"
            onClick={() => void startAgain(entry, deps)}
            aria-label={`Start ${entry.titleName} again`}
            className={`${SECONDARY_BUTTON_COMPACT} w-full`}
          >
            Start again
          </button>
        </div>
      )}
    />
  );
}

/** The action, with a request that never arrived reported as the lost write it is —
 *  `title-actions.tsx`'s `resume`, for the same reason. */
async function resume(libraryEntryId: string): Promise<ResumeOutcome> {
  try {
    const outcome = await resumeAction(libraryEntryId);
    return outcome.ok ? { ok: true } : outcome;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "resume" }) };
  }
}
