"use client";

import { useRef, useState } from "react";

import type { LibraryState } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { abandonAction, unabandonAction, type AbandonOutcome } from "./title-detail-actions";

/**
 * The one hand-set state in the model, and the way back out of it — issue #87.
 * `DESIGN.md`'s Abandon Control section is binding: a hairline-topped row carrying a dim
 * underlined text button, no border, no fill, no icon, and **never vermilion** in any
 * state, because vermilion is reserved for recording a watch.
 *
 * ── One row, both directions ──────────────────────────────────────────────────────────
 *
 * `abandoned` says which of the two writes a press means, and it comes from the caller
 * rather than being tracked here — this component holds no copy of the title's state, so
 * there is nothing here that can disagree with `getTitleDetail`'s read of it. `onChanged`
 * is how the caller learns the write landed; what it does with that is the caller's, not
 * this component's — the programme note patches its own `state` field with it, and a
 * future Up next card (`DESIGN.md`: "the same control in a second place, not a second
 * design") is free to do something else entirely, which is what makes this reusable there
 * without a second implementation.
 *
 * ── The write-failure toast, the same shape as the search screen's add ────────────────
 *
 * `SPEC.md` §3.3: a lost write is never silent. A failed press raises the persistent toast
 * naming the title, with *Try again* wired to the same attempt — `catalogue-result.tsx`
 * (issue #55) is the toast's first caller and the pattern this follows: one toast per lost
 * write, not one per attempt, and it is the caller's job to resolve it, never a timer's.
 */
export function AbandonControl({
  libraryEntryId,
  titleName,
  abandoned,
  onChanged,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly abandoned: boolean;
  readonly onChanged: (state: LibraryState) => void;
}) {
  const [pending, setPending] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  // A declaration, not a `useCallback`: it is handed to the toast as `retry`, and a
  // `const` cannot be referenced inside its own initialiser. `abandoned` is a prop fixed
  // for the life of one press — the button that started an attempt is the one whose retry
  // this closes over, even if the entry's real state has since moved on.
  async function attempt(): Promise<void> {
    setPending(true);
    const outcome = await write(abandoned, libraryEntryId);
    setPending(false);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      onChanged(outcome.state);
      return;
    }

    if (raised.current) return;
    raised.current = writeFailures.raise({
      title: titleName,
      reference: outcome.reference,
      retry: () => void attempt(),
    });
  }

  return (
    <div className="mt-7 flex items-baseline justify-between border-t border-rule pt-5">
      <button
        type="button"
        onClick={() => void attempt()}
        disabled={pending}
        aria-label={abandoned ? `Take back giving up on ${titleName}` : `Give up on ${titleName}`}
        className="code-line text-stock-dim underline decoration-rule-bold underline-offset-4 transition-colors duration-150 hover:text-stock disabled:cursor-wait"
      >
        {abandoned ? "Take it back" : "Give up on this"}
      </button>

      {/* `DESIGN.md`: the reassurance sits opposite, as a dim code line, only where it is
          the true statement — there is nothing left to reassure once it is abandoned. */}
      {abandoned ? null : (
        <span className="code-line text-stock-dim">Watching it again clears it</span>
      )}
    </div>
  );
}

async function write(abandoned: boolean, libraryEntryId: string): Promise<AbandonOutcome> {
  try {
    return abandoned ? await unabandonAction(libraryEntryId) : await abandonAction(libraryEntryId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "abandon" }) };
  }
}
