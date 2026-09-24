"use client";

import { useRef, useState } from "react";

import { GHOST_RECOVERY, IN_FLIGHT } from "@/errors/recovery-buttons";
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
 * ── The confirm button is `GHOST_RECOVERY`, not `SOLID_RECOVERY` ───────────────────────
 *
 * `errors/recovery-buttons.ts` reserves solid `accent` for *the one primary recovery
 * action*, and `delete-account-form.tsx` widens that once, by name, to the one other
 * irreversible authored moment in the product. Deleting a list is neither: nothing here is
 * destroyed that cannot be remade by naming a new list, so the confirm stays at the ghost
 * treatment every other secondary action in the app uses.
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
      className="dialog-transition border-2 border-hair bg-ground p-6 text-text backdrop:bg-ground/80"
    >
      <h2 id={`delete-list-${listId}-h`} className="bill-title text-bill-sm text-text">
        Delete &ldquo;{listName}&rdquo;?
      </h2>

      <p className="mt-3 max-w-[46ch] text-note leading-relaxed text-dim">
        It holds {formatTitleCount(titleCount)}. Nothing about those shows changes — this
        only removes the list itself.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={inFlight}
          className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight ? "Deleting" : "Delete list"}
        </button>

        {/* Issue #195: was dim underlined text, now the same GHOST_RECOVERY the confirm
            button above already wears — the underline was the only thing marking this as
            a control at all, and dropping it without a border would drop the control. */}
        <button
          type="button"
          onClick={() => ref.current?.close()}
          disabled={inFlight}
          className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
