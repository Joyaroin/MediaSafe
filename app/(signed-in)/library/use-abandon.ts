"use client";

import { useRef, useState } from "react";

import type { LibraryState } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { abandonAction, unabandonAction, type AbandonOutcome } from "./title-detail-actions";

/**
 * Giving up on a title, and taking it back — the write, without the button.
 *
 * ── Why this was lifted out of `AbandonControl` ─────────────────────────────────────
 *
 * There are two places to press it now: the control itself, and the hero's *Where this
 * stands* menu. Copying the body into the second would be two implementations of one
 * write — two optimistic flips, two `raise()` calls, two chances for a lost write to be
 * reported differently or twice. This is the write; both callers render their own control
 * over it.
 *
 * Everything about the original is preserved deliberately:
 *
 * - **The optimistic flip**, so the state line moves under the thumb rather than after a
 *   round trip, and reverts if the write is lost.
 * - **One toast per lost write, not one per attempt** (`AGENTS.md`) — `raised` holds the
 *   handle, and a retry that fails again finds it already standing and adds nothing.
 * - **`resolve()` on the write that lands**, including a retry landing after a failure.
 * - **`attempt` as a declaration rather than a `useCallback`**, because it is handed to the
 *   toast as its own `retry` and a `const` cannot be referenced inside its initialiser.
 */
export interface Abandon {
  /** What the control should draw *now* — the optimistic value while a write is in
   *  flight, and the truth otherwise. */
  readonly abandoned: boolean;
  /** A write is in flight; the control disables itself on this. */
  readonly pending: boolean;
  readonly toggle: () => void;
}

export function useAbandon({
  libraryEntryId,
  titleName,
  abandoned,
  onChanged,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly abandoned: boolean;
  readonly onChanged: (libraryEntryId: string, state: LibraryState) => void;
}): Abandon {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const shown = optimistic ?? abandoned;
  const raised = useRef<WriteFailureHandle | null>(null);

  async function attempt(): Promise<void> {
    const wasAbandoned = shown;
    setOptimistic(!wasAbandoned);

    const outcome = await write(wasAbandoned, libraryEntryId);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setOptimistic(null);
      onChanged(libraryEntryId, outcome.state);
      return;
    }

    setOptimistic(null);

    if (raised.current) return;
    raised.current = writeFailures.raise({
      title: titleName,
      reference: outcome.reference,
      retry: () => void attempt(),
    });
  }

  return { abandoned: shown, pending: optimistic !== null, toggle: () => void attempt() };
}

async function write(abandoned: boolean, libraryEntryId: string): Promise<AbandonOutcome> {
  try {
    return abandoned ? await unabandonAction(libraryEntryId) : await abandonAction(libraryEntryId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "abandon" }) };
  }
}
