"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import type { TitleKind } from "@/tmdb/mirror";
import { QUIET_RECORDING_CONTROL_LABELLED } from "@/app/(signed-in)/library/watch-mark-motion";
import {
  addUnownedTitleToLibraryAction,
  addUnownedTitleWatchedToLibraryAction,
  type AddToLibraryOutcome,
} from "@/app/(signed-in)/titles/actions";
import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/titles/add-watched";

/**
 * *Add to library*, and *Add — watched* beside it — issue #148's control and issue
 * #222's. Everything else title detail can do to a title is a thing you can only do to
 * one you have, so this is still the only door; it is now two presses wide, and both of
 * them lead through it.
 *
 * **The door is what is shared, and the destination is why.** Both writes end with this
 * account owning the title, so both navigate to the same place, raise the same toast when
 * they are lost, and hand the reader the same page afterwards. What differs is one
 * argument to one action, which is why there is one `attempt` here and not two.
 *
 * ── It navigates rather than patching in place ────────────────────────────────────────
 *
 * Every other optimistic control in this codebase changes something on the surface it
 * sits on: a row says *In your library*, a state line changes, an episode dims. This one
 * cannot, because what changes is the page's identity — the title is now yours, and yours
 * has a page of its own, keyed by the library entry that did not exist a moment ago.
 * Issue #148's *afterwards the title behaves like everything else — there are not two
 * kinds of show* is what that navigation is; drawing the owned controls onto this page
 * instead would be building the second kind.
 *
 * `replace`, not `push`. The page being left is a page for a title this account now owns,
 * and `page.tsx` sends any such request on to `library/[entryId]` — so a history entry
 * for it is a back button that bounces the reader forward again. Replacing it means back
 * does what back does: it returns to the list the title was tapped in.
 *
 * ── Not optimistic, and that is not a relaxation of §3.3 ──────────────────────────────
 *
 * There is nothing to show optimistically: the destination does not exist until the write
 * lands, since the entry id *is* the write's result. So the control marks itself busy and
 * navigates once the server answers. `SPEC.md` §3.3 is about a **lost** write never being
 * silent, and that half is unchanged — a failure puts the control back and raises the
 * persistent toast naming the title, with the reference id from the action.
 *
 * The toast handle is a ref, and `attempt` is a function declaration so it can hand itself
 * to the toast as `retry`; `catalogue-result.tsx` carries the full reasoning for both, and
 * for **one toast per lost write, not one per attempt** (`AGENTS.md`).
 *
 * The suppression guard is `standing()` rather than the bare `if (raised.current) return`
 * that file uses. `errors/write-failure.ts`'s own docblock is why, and it is the blind
 * spot in the bare form: a reader who dismisses a toast leaves the ref holding a handle
 * for a failure that is no longer on screen, and the *next* lost write is then suppressed
 * entirely — *a lost write is never silent* (`SPEC.md` §3.3) broken by the reader's own
 * tidying up.
 *
 * The caller mounts this under a key of the title it is about, for the reason `page.tsx`
 * gives there: neither the ref nor `pending` may survive onto a different title.
 */
export function AddToLibraryControl({
  kind,
  tmdbId,
  titleName,
}: {
  kind: TitleKind;
  tmdbId: number;
  titleName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);
  /**
   * The watched add's idempotency key — issue #222, minted on the first press and kept so
   * a retry is the same write rather than a second one. `catalogue-result.tsx` carries
   * the full reasoning, and the key is minted the same way for the same reason.
   */
  const watchedKey = useRef<string | null>(null);

  /**
   * `watched` picks the write and travels into the toast's `retry` closure, so a retry
   * retries the press that failed. Both controls share the one handle and the one
   * `pending` flag: from this page's point of view they are the same event — this title
   * is yours now, and the page you are on is no longer the right page — so a lost one of
   * either is one sentence to the reader (`AGENTS.md`, *one toast per lost write*).
   */
  async function attempt(watched: boolean): Promise<void> {
    setPending(true);

    const outcome = watched
      ? await addWatched(kind, tmdbId, (watchedKey.current ??= key()))
      : await add(kind, tmdbId);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing that takes this toast down other than the reader.
      raised.current?.resolve();
      raised.current = null;
      // `pending` is deliberately left set: the control is on its way off screen, and
      // re-enabling it would offer a second press during the navigation.
      router.replace(`/library/${outcome.libraryEntryId}`);
      return;
    }

    setPending(false);

    if (raised.current?.standing()) return;

    raised.current = writeFailures.raise({
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      title: titleName,
      // No episode: this is a change to the title itself, not to one instalment.
      reference: outcome.reference,
      retry: () => void attempt(watched),
    });
  }

  return (
    /**
     * Two controls, wrapping rather than truncating — issue #222. This page has no fixed
     * slot and no row to fit into, so the pair lays out in ordinary flow and takes a
     * second line on a narrow phone rather than squeezing either label.
     */
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void attempt(false)}
        disabled={pending}
        /**
         * The chip treatment `catalogue-result.tsx` already reasons about — **not**
         * accent. Accent is reserved for recording a watch, and adding a title to a
         * library is not the daily gesture that reservation exists to protect. The label
         * is written out in full where search's is one word: search's row is the context
         * that lets *Add* be understood, and this page has no row.
         */
        className={`code-line border border-hair px-4 py-2 text-text transition-colors duration-150 hover:bg-text hover:text-ground ${IN_FLIGHT}`}
      >
        Add to library
      </button>

      {/**
       * The watched add, in the quiet register — `watch-mark-motion.tsx` carries why it
       * is dim rather than accent, and the argument lands harder on this page than on the
       * search row: the plain add here is **already** the hairline chip, so the only
       * thing left to separate the default from the option is the ink. Full-strength
       * `text` against `dim` is `DESIGN.md` §3's own device for exactly that, and it is
       * what the sidebar uses to say which destination you are on.
       *
       * Two accent controls side by side would say neither is the default; a second
       * `text` chip would say the same thing the other way.
       */}
      <button
        type="button"
        onClick={() => void attempt(true)}
        disabled={pending}
        aria-label={addWatchedAccessibleLabel(kind, titleName)}
        className={`${QUIET_RECORDING_CONTROL_LABELLED} ${IN_FLIGHT}`}
      >
        {addWatchedLabel(kind)}
      </button>
    </div>
  );
}

/**
 * The action, with the one failure it cannot report itself turned into the same shape —
 * the request never reaching the server. See `search-surface.tsx`'s `search()`.
 */
async function add(kind: TitleKind, tmdbId: number): Promise<AddToLibraryOutcome> {
  try {
    return await addUnownedTitleToLibraryAction(kind, tmdbId);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "unowned-add" }),
    };
  }
}

/** The same, for the watched add — issue #222. */
async function addWatched(
  kind: TitleKind,
  tmdbId: number,
  sourceKey: string,
): Promise<AddToLibraryOutcome> {
  try {
    return await addUnownedTitleWatchedToLibraryAction(kind, tmdbId, sourceKey);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "unowned-add-watched" }),
    };
  }
}

/**
 * One press, one idempotency key. `catalogue-result.tsx` carries why the key names the
 * write rather than the attempt.
 */
const key = () => crypto.randomUUID();
