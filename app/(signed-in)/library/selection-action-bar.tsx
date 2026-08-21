"use client";

import { useEffect, useRef, useState } from "react";

import {
  listsForPickerAction,
  type ListsForPickerOutcome,
} from "@/app/(signed-in)/lists/actions";
import { formatTitleCount } from "@/app/(signed-in)/lists/title-count";
import { PHONE_BAR } from "@/app/phone-bar";
import type { ListSummary } from "@/db/access";
import { GHOST_RECOVERY, IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { useBulkSelection, useBulkSelectionView } from "./bulk-selection-context";

/**
 * The bar that takes the tab bar's place while the reader is choosing — issue #197, and
 * issue #199's second action beside the first.
 *
 * ── Replaced, not stacked ────────────────────────────────────────────────────────────
 *
 * The ticket is explicit about which of the two it is: *the four destinations are
 * irrelevant mid-selection and stacking a second bar over a phone grid is worse than
 * swapping the one already there; it reuses the tab bar's frosted treatment and the space
 * the layout reserves.*
 *
 * So this bar is the tab bar's own recipe — `frosted`, a `1px` top hairline, a `44px` row
 * over `pt-2 pb-[22px]`, which is the `75px` `--tab-bar-height` already declares and
 * `(signed-in)/layout.tsx` already clears at the foot of every phone page. Nothing has to
 * reserve any new space, because there is no new space.
 *
 * And the bar it replaces genuinely goes: `data-selecting` on the document element takes
 * `.phone-tab-bar` out of the layout entirely (`app/globals.css`). Covering it with a
 * higher `z-index` would have looked identical and been wrong — the four `Link`s would
 * still be in the accessibility tree and still reachable by a screen reader's own
 * navigation, which is a bar of controls the ticket says are irrelevant, invisibly live
 * under the reader's thumb.
 *
 * An attribute on `<html>` rather than state threaded up to the layout, for the reason
 * `lib/theme.ts` puts the palette there: the tab bar is rendered by `(signed-in)/layout.tsx`
 * and this bar by the Library's own grid, so there is no component above both that has any
 * other reason to know either exists. One attribute and one CSS rule is the whole
 * mechanism, and it disappears with this component.
 *
 * ── Three controls in a row that cannot grow ─────────────────────────────────────────
 *
 * The bar's height is not this file's to spend. `app/phone-bar.ts` fixes it at the tab
 * bar's own `44 + 8 + 22 + 1 = 75px` precisely so the swap moves nothing under it, and
 * `(signed-in)/layout.tsx` clears exactly that at the foot of every phone page — so a
 * second line for the count is not an option, however tempting it looks once there are
 * three controls beside it.
 *
 * What gives instead is the **status line's wording**, and only its wording. It read
 * *6 titles selected* while there were two controls; with three that sentence and
 * `Add to list`, `Abandon` and `Done` want more than a 375px phone has between the bar's
 * `22px` margins. So the line is now *6 selected* — the number and the verb, which is the
 * whole of what it was saying, since the things being counted are on screen wearing check
 * badges. The word it drops is the one `formatTitleCount` exists to pluralise, so that
 * helper is no longer the right tool for this line and is not called on it; the picker's
 * heading below still asks it the question it answers well, *how do you name a count of
 * titles in a sentence.*
 *
 * `truncate` under a `min-w-0` is the safety valve rather than the plan: the buttons are
 * `shrink-0`, so on a phone narrower than anything this was measured against the count
 * clips and the controls stay whole, which is the right way round for a bar whose reason
 * to exist is the controls.
 *
 * ── Abandon sits beside Add to list, and Done still ends the row ─────────────────────
 *
 * Issue #199's own placement. It takes the ghost treatment against *Add to list*'s solid
 * one, because the two are not equals: adding is the action the mode was built for and
 * abandoning is the other thing you might do with the same selection.
 *
 * That leaves two ghost buttons next to each other, and the cost is worth naming: *Done*
 * and *Abandon* are told apart by their labels rather than by their register, on a bar
 * pressed with a thumb. It is accepted here rather than designed around because the
 * mis-tap is recoverable — an abandon is a column with a control that clears it on every
 * one of those titles (`abandon-control.tsx`), which is exactly the argument the ticket
 * uses to refuse a confirmation here and to keep one on removal, where nothing comes back.
 *
 * ── The picker, and what it does not offer ───────────────────────────────────────────
 *
 * The rows are `listsForPickerAction`'s — the same read title detail's *Add to list*
 * dialog makes (#147), because *this account's lists* is one question with one answer.
 * What is deliberately **not** here is that dialog's *name a new list* field. #147 built
 * it into the same action so that a first list was not a separate errand; here it would
 * have to raise its own write-failure toast from outside the store, and issue #197 puts
 * every rule — including *how a lost write is reported* — inside `bulk-selection.ts`
 * precisely so there is one of them. A reader with no lists at all is told where to make
 * one rather than being handed a second, differently-behaved write on the busiest bar in
 * the app.
 */

/** The attribute `app/globals.css` hangs the tab bar's disappearance off. */
const SELECTING_ATTRIBUTE = "data-selecting";

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly lists: readonly ListSummary[] }
  | { readonly kind: "failed"; readonly reference: string | null };

export function SelectionActionBar() {
  const selection = useBulkSelection();
  const view = useBulkSelectionView();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase | null>(null);

  const selecting = view?.selecting ?? false;

  useEffect(() => {
    if (!selecting) return;
    document.documentElement.setAttribute(SELECTING_ATTRIBUTE, "true");
    return () => document.documentElement.removeAttribute(SELECTING_ATTRIBUTE);
  }, [selecting]);

  /**
   * The mode ending closes the picker with it — on *Done*, on the last cell being
   * deselected, and on a successful add. All three are the same event from here: there is
   * no longer a selection for this dialog to be about, and a modal left open over an empty
   * one would be a picker that adds nothing.
   */
  useEffect(() => {
    if (selecting) return;
    dialogRef.current?.close();
  }, [selecting]);

  // No provider above this — the desktop. There is no bar, no picker and no dialog element
  // sitting in the document waiting for one.
  if (selection === null || view === null) return null;

  /**
   * A write of either kind is on the wire, so neither control is armed.
   *
   * One flag over both of the store's, because the store refuses either press while either
   * write is in flight (`bulk-selection.ts`) and a button that is refused should not look
   * pressable. *Done* is deliberately left out of it: ending the mode is not a write, and a
   * reader who has decided to leave should not be held there by a round trip they cannot
   * see. A write already started still lands, still ends in its own toast if it is lost,
   * and the store's identity check is what stops a late one clearing a selection that has
   * moved on.
   */
  const busy = view.adding || view.abandoning;

  function openPicker(): void {
    dialogRef.current?.showModal();
    setPhase({ kind: "loading" });
    void read();
  }

  async function read(): Promise<void> {
    const outcome = await readLists();
    setPhase(
      outcome.ok
        ? { kind: "loaded", lists: outcome.lists }
        : { kind: "failed", reference: outcome.reference },
    );
  }

  // The store decides everything that follows: whether the write is even attempted, what
  // happens to the selection, and what the reader is told if it is lost. A landed write
  // ends the mode, and the effect above is what closes this dialog behind it.
  //
  // An arrow rather than a declaration, so that TypeScript's narrowing of `selection` above
  // reaches inside it — a hoisted `function` is created before the guard, as far as the
  // checker is concerned, and sees the nullable original.
  const addTo = (listId: string): void => void selection.addToList(listId);

  return (
    <>
      {selecting ? (
        <nav
          // Not `Primary` — that name belongs to the tab bar, and while this is on screen
          // the tab bar is gone rather than renamed.
          aria-label="Selected titles"
          // `PHONE_BAR` is the tab bar's own recipe, shared rather than restated
          // (`app/phone-bar.ts`) — which is what makes *it reuses the tab bar's frosted
          // treatment and the space the layout reserves* a fact about one string instead
          // of a claim about two. The row inside it is this bar's own.
          className={`${PHONE_BAR} flex items-center gap-2 px-[22px]`}
        >
          {/* Polite, not assertive: the count changes on every tap and this is the
              reader's own running total, not news about something that went wrong. */}
          <p role="status" className="code-line min-w-0 flex-1 truncate text-dim" data-numeric>
            {view.selected.length.toLocaleString("en-GB")} selected
          </p>

          <button
            type="button"
            onClick={openPicker}
            disabled={busy}
            className={`${SOLID_RECOVERY} h-11 shrink-0 px-3 ${IN_FLIGHT}`}
          >
            {view.adding ? "Adding" : "Add to list"}
          </button>

          <button
            type="button"
            onClick={() => void selection.abandon()}
            disabled={busy}
            // No confirmation, deliberately, and issue #199 is explicit about why the
            // sibling control has one: removal's dialog reads a per-title footprint
            // because a hundred-and-eighteen watches is a different decision from none.
            // Abandoning destroys nothing and every one of these titles keeps a control
            // that takes it back, so there is no number here worth stopping the reader to
            // state — and a summary across six is the collapse that reasoning rejects.
            className={`${GHOST_RECOVERY} h-11 shrink-0 px-3 ${IN_FLIGHT}`}
          >
            {view.abandoning ? "Abandoning" : "Abandon"}
          </button>

          <button
            type="button"
            onClick={() => selection.end()}
            className={`${GHOST_RECOVERY} h-11 shrink-0 px-3`}
          >
            Done
          </button>
        </nav>
      ) : null}

      {/* Mounted for as long as there is a selection to be had, rather than only while one
          is open. The effect above closes it when the mode ends, and it can only do that if
          the element it closes is still here to be closed. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="bulk-add-to-list-h"
        className="w-full max-w-[420px] border-2 border-accent bg-ground p-6 text-text backdrop:bg-ground/80"
      >
        <h2 id="bulk-add-to-list-h" className="bill-title text-bill-sm text-text">
          Add {formatTitleCount(view.selected.length)} to a list
        </h2>

        <div className="mt-5">
          {phase === null || phase.kind === "loading" ? (
            <p role="status" className="code-line text-dim">
              Reading your lists
            </p>
          ) : null}

          {phase?.kind === "failed" ? (
            <ReadFailure
              reference={phase.reference}
              retry={() => void read()}
            />
          ) : null}

          {phase?.kind === "loaded" ? (
            phase.lists.length === 0 ? (
              <p className="text-note leading-relaxed text-dim">
                You have no lists yet. Make one on the Lists tab, then come back.
              </p>
            ) : (
              <ul>
                {phase.lists.map((list) => (
                  <li
                    key={list.id}
                    className="flex items-center justify-between gap-4 border-b border-hair py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-item text-text">{list.name}</p>
                      <p className="code-line text-dim" data-numeric>
                        {formatTitleCount(list.titleCount)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => addTo(list.id)}
                      disabled={busy}
                      aria-label={`Add to ${list.name}`}
                      className={`code-line shrink-0 border border-hair px-4 py-2 text-text transition-colors duration-150 hover:bg-text hover:text-ground ${IN_FLIGHT}`}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={GHOST_RECOVERY}
          >
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}

async function readLists(): Promise<ListsForPickerOutcome> {
  try {
    return await listsForPickerAction();
  } catch (error) {
    return {
      ok: false,
      reference: referenceFor(error, { surface: "bulk-add-to-list" }),
    };
  }
}
