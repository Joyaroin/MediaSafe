"use client";

import { useRef, useState } from "react";

import { DESTRUCTIVE_BUTTON_COMPACT, DIALOG_FRAME, PLAIN_BUTTON } from "@/app/buttons";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { deleteListAction } from "./actions";
import { formatTitleCount } from "./title-count";

/**
 * The plain confirmation issue #146 asks for — *naming the list, saying how many titles
 * it holds, and saying that nothing about those shows changes. One confirmation, no
 * typing: the ceremony matches what is actually at risk, which is no history at all.*
 *
 * ── Why a dialog and not its own route ──────────────────────────────────────────────
 *
 * Account deletion (`settings/delete-account/page.tsx`) is its own page because leaving a
 * page is a deliberate act and a dialog is only dismissed. That reasoning does not carry
 * over here: deleting an account destroys history with no way back, and issue #146 is
 * explicit that a list holds no history at all — the shows and every watch of them are
 * untouched. A one-click dialog is what "proportionate" means for a grouping, not a
 * lesser version of the account page's ceremony.
 *
 * The native `<dialog>` element is used rather than a hand-built overlay: `showModal()`
 * gets the backdrop, the focus trap and Escape-to-close for free, none of which this
 * application has had to build before. `ListRow` opens it by calling `.showModal()` on
 * the ref this component takes directly — React 19 passes `ref` as an ordinary prop, so
 * there is no `forwardRef` wrapper to write for one element.
 *
 * ── Opened from the list's own page, since Charcoal ──────────────────────────────────
 *
 * It used to open from a *Delete* button on every row of Lists; that button moved behind
 * the three-dot menu on the list's page (handoff §8.5, issue #402), and `ListDetailSurface`
 * is the one caller. The confirm is the danger treatment — a `danger` line and `danger`
 * text, never a fill — because it takes something away, and *Cancel* is plain. Neither is
 * filled: nothing here is the one main action.
 */
export function DeleteListDialog({
  ref,
  listId,
  listName,
  titleCount,
  onDeleted,
}: {
  readonly ref: React.RefObject<HTMLDialogElement | null>;
  readonly listId: string;
  readonly listName: string;
  readonly titleCount: number;
  readonly onDeleted: (listId: string) => void;
}) {
  const [inFlight, setInFlight] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  async function confirm(): Promise<void> {
    setInFlight(true);

    const outcome = await deleteListAction(listId);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setInFlight(false);
      ref.current?.close();
      onDeleted(listId);
      return;
    }

    setInFlight(false);

    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      title: listName,
      reference: outcome.reference,
      retry: () => void confirm(),
    });
  }

  return (
    // Issue #311 re-narrows the frame: this dialog was named as borrowing
    // `border-2 border-accent` — the write-failure toast's own frame — for a routine
    // dialog that is neither a failure nor irreversible. `border-hair` keeps the same
    // weight and the same surface; only the colour that claimed *failure* is gone.
    <dialog
      ref={ref}
      aria-labelledby={`delete-list-${listId}-h`}
      // `dialog-transition` (issue #333, `app/globals.css`): arrives and leaves on a
      // transition rather than a keyframe, because Cancel or Escape can end this dialog
      // before its own entrance has finished.
      className={DIALOG_FRAME}
    >
      <h2 id={`delete-list-${listId}-h`} className="bill-title text-bill-lg text-text">
        Delete &ldquo;{listName}&rdquo;?
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        It holds {formatTitleCount(titleCount)}. Nothing about those shows changes. This
        only removes the list itself.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={inFlight}
          className={DESTRUCTIVE_BUTTON_COMPACT}
        >
          {inFlight ? "Deleting" : "Delete list"}
        </button>

        <button
          type="button"
          onClick={() => ref.current?.close()}
          disabled={inFlight}
          className={PLAIN_BUTTON}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
