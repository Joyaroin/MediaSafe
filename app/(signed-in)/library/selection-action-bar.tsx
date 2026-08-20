"use client";

import { useEffect, useRef, useState } from "react";

import {
  listsForPickerAction,
  type ListsForPickerOutcome,
} from "@/app/(signed-in)/lists/actions";
import { formatTitleCount } from "@/app/(signed-in)/lists/title-count";
import type { ListSummary } from "@/db/access";
import { GHOST_RECOVERY, IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { useBulkSelection, useBulkSelectionView } from "./bulk-selection-context";

/**
 * The bar that takes the tab bar's place while the reader is choosing — issue #197.
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
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-hair frosted px-[22px] pt-2 pb-[22px] lg:hidden"
        >
          {/* Polite, not assertive: the count changes on every tap and this is the
              reader's own running total, not news about something that went wrong. */}
          <p role="status" className="code-line flex-1 text-dim" data-numeric>
            {formatTitleCount(view.selected.length)} selected
          </p>

          <button
            type="button"
            onClick={openPicker}
            disabled={view.adding}
            className={`${SOLID_RECOVERY} h-11 shrink-0 ${IN_FLIGHT}`}
          >
            {view.adding ? "Adding" : "Add to list"}
          </button>

          <button
            type="button"
            onClick={() => selection.end()}
            className={`${GHOST_RECOVERY} h-11 shrink-0`}
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
                      disabled={view.adding}
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
