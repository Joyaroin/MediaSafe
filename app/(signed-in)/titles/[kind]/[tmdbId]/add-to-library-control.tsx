"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import type { TitleKind } from "@/tmdb/mirror";
import {
  addUnownedTitleToLibraryAction,
  type AddToLibraryOutcome,
} from "@/app/(signed-in)/titles/actions";

/**
 * *Add to library* — issue #148's one control, and the whole of what this page offers to
 * do to a title. Everything else title detail can do to a title is a thing you can only
 * do to one you have, so this is the only door, and it is one press wide.
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
 * for **one toast per lost write, not one per attempt** (`AGENTS.md`). `standing()` is
 * asked before suppressing, because a reader who dismissed the first toast must still be
 * told about the next lost write.
 *
 * The caller mounts this under a key of the title it is about, for the reason
 * `page.tsx` gives there: neither the ref nor `pending` may survive onto a different
 * title, and a standing toast for one lost add must not suppress another title's.
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

  async function attempt(): Promise<void> {
    setPending(true);

    const outcome = await add(kind, tmdbId);

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
      retry: () => void attempt(),
    });
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void attempt()}
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
