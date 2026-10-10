import type { WriteFailureHandle, WriteFailureStore } from "@/errors/write-failure";

/**
 * *Start again* on a stopped show — issue #373, as a function of its collaborators so
 * `tests/start-again.test.ts` can hold the error discipline without a browser.
 *
 * Optimistic: the tile leaves the rail on the press. The write is the existing
 * `resumeAction` (`unabandonTitle`), not a new path. A lost write puts the tile back and
 * raises **one** write-failure toast whose *Try again* repeats the press; a retry that
 * fails again finds that toast still standing and raises nothing new, and a retry that
 * lands resolves it.
 */
export type ResumeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

export interface StartAgainDeps {
  readonly resume: (libraryEntryId: string) => Promise<ResumeOutcome>;
  readonly failures: WriteFailureStore;
  /** One standing toast per show, so a retry can tell whether it already has one. */
  readonly raised: Map<string, WriteFailureHandle>;
  readonly hide: (libraryEntryId: string) => void;
  readonly restore: (libraryEntryId: string) => void;
}

export async function startAgain(
  show: { readonly libraryEntryId: string; readonly titleName: string },
  deps: StartAgainDeps,
): Promise<void> {
  const id = show.libraryEntryId;
  deps.hide(id);

  const outcome = await deps.resume(id);

  if (!outcome.ok) {
    deps.restore(id);
    if (deps.raised.get(id)?.standing()) return;
    deps.raised.set(
      id,
      deps.failures.raise({
        title: show.titleName,
        reference: outcome.reference,
        retry: () => void startAgain(show, deps),
      }),
    );
    return;
  }

  deps.raised.get(id)?.resolve();
  deps.raised.delete(id);
}
