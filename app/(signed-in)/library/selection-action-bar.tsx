"use client";

import { DIALOG_FRAME } from "@/app/buttons";
import { useEffect, useRef, useState } from "react";

import {
  listsForPickerAction,
  type ListsForPickerOutcome,
} from "@/app/(signed-in)/lists/actions";
import { formatTitleCount } from "@/app/(signed-in)/lists/title-count";
import { PHONE_BAR, SELECTING_ATTRIBUTE } from "@/app/phone-bar";
import type { ListSummary } from "@/db/access";
import {
  GHOST_RECOVERY,
  GHOST_RECOVERY_COMPACT,
  IN_FLIGHT,
  SOLID_RECOVERY_COMPACT,
} from "@/errors/recovery-buttons";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { useBulkSelection, useBulkSelectionView } from "./bulk-selection-context";

/**
 * The bar that takes the tab bar's place while the reader is choosing — issue #197.
 *
 * It carried a second action for a while: issue #199's bulk *Abandon*, beside *Add to
 * list*. Giving up on a title is not something this application offers any more — not here
 * and not on title detail — so the bar is back to the two controls it was designed with.
 * The state is not gone, only the ways in: `title-hero.tsx` carries that whole statement.
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
 * ── Two controls in a row that cannot grow ───────────────────────────────────────────
 *
 * The bar's height is not this file's to spend. `app/phone-bar.ts` fixes it at the tab
 * bar's own `44 + 8 + 22 + 1 = 75px` precisely so the swap moves nothing under it, and
 * `(signed-in)/layout.tsx` clears exactly that at the foot of every phone page — so a
 * second line for the count is not an option, however tempting it looked when there were
 * three controls beside it.
 *
 * What gave instead was the **status line's wording**, and only its wording. It read
 * *6 titles selected* while there were two controls; a third — `Add to list`, `Abandon`
 * and `Done` — wanted more than a 375px phone has between the bar's `22px` margins. So the
 * line became *6 selected*: the number and the verb, which is the whole of what it was
 * saying, since the things being counted are on screen wearing check badges.
 *
 * **It stays that way now that the third control is gone**, and that is a decision rather
 * than an oversight. The shorter line is the better line — it says the same thing in less
 * space on the most cramped surface in the application — and reverting it would spend the
 * room a removed button freed on a word that was never carrying anything. The word it drops is the one `formatTitleCount` exists to pluralise, so that
 * helper is no longer the right tool for this line and is not called on it; the picker's
 * heading below still asks it the question it answers well, *how do you name a count of
 * titles in a sentence.*
 *
 * The gap closes from `gap-3` to `gap-2`, and the controls take the **compact
 * measure** — `SOLID_RECOVERY_COMPACT` and `GHOST_RECOVERY_COMPACT`, `px-2.5 py-1` against
 * the surface-level `px-4 py-2`. That is the same treatment at a different measure, not a
 * second register: issue #203 established the ghost one for the episode row and this
 * ticket added the solid one beside it, both argued in `errors/recovery-buttons.ts`. The
 * two tickets are the same failure from opposite ends — there a fixed slot grew a row,
 * here a fixed row squeezed a label.
 *
 * A `px-3` at these call sites was tried first, and is worth recording as a thing not to
 * try again: it is not merely off-system, it does **nothing**. This project has no
 * `tailwind-merge`, so two padding utilities on one element are decided by the order
 * Tailwind emits them, and `.px-4` is written after `.px-3` in the stylesheet — the later
 * rule wins whatever the class string says. Overriding a named treatment from a call site
 * here is inert, which is exactly why the measure had to become a named constant.
 *
 * `truncate` under a `min-w-0` is what absorbs the rest: `shrink-0` is baked into both
 * compact constants, so where the row still does not fit the count clips and the controls
 * stay whole, which is the right way round for a bar whose reason to exist is the
 * controls.
 *
 * The dialog below keeps the **surface** measure — its *Cancel* is still `GHOST_RECOVERY`.
 * The compact one earns its keep in a row that cannot grow, and a modal with a whole page
 * to itself is the opposite of that.
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
   * The write is on the wire, so the control that starts it is not armed.
   *
   * It read across two flags while there were two writes, because the store refused either
   * press while either was in flight. There is one of each now, and the name stays `busy`
   * rather than collapsing into `view.adding` at the call sites: what the buttons want to
   * know is *is this bar mid-write*, which is a question about the bar and not about the
   * add.
   *
   * *Done* is deliberately left out of it: ending the mode is not a write, and a reader who
   * has decided to leave should not be held there by a round trip they cannot see. A write
   * already started still lands, still ends in its own toast if it is lost, and the store's
   * identity check is what stops a late one clearing a selection that has moved on.
   */
  const busy = view.adding;

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
      {/* Always mounted while a provider exists above — issue #333. `selection-action-
          bar-transition` (`app/globals.css`) arrives and leaves on a transition rather
          than the arrival keyframe, and a transition needs the box it animates to still
          be in the document on the frame `selecting` flips — a node React removes
          outright cannot be animated on its way out. `data-open="true"` is the one
          boolean this component still owns; `display: none` at rest keeps every control
          below out of the accessibility tree and the tab order exactly as the old
          conditional render did. */}
      <nav
        // Not `Primary` — that name belongs to the tab bar, and while this is on screen
        // the tab bar is gone rather than renamed.
        aria-label="Selected titles"
        data-open={selecting ? "true" : undefined}
        // `PHONE_BAR` is the tab bar's own recipe, shared rather than restated
        // (`app/phone-bar.ts`) — which is what makes *it reuses the tab bar's frosted
        // treatment and the space the layout reserves* a fact about one string instead
        // of a claim about two. The row inside it is this bar's own.
        className={`selection-action-bar-transition ${PHONE_BAR} items-center gap-2 px-gutter`}
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
          className={`${SOLID_RECOVERY_COMPACT} h-11 ${IN_FLIGHT}`}
        >
          {view.adding ? "Adding" : "Add to list"}
        </button>

        <button
          type="button"
          onClick={() => selection.end()}
          className={`${GHOST_RECOVERY_COMPACT} h-11`}
        >
          Done
        </button>
      </nav>

      {/* Mounted for as long as there is a selection to be had, rather than only while one
          is open. The effect above closes it when the mode ends, and it can only do that if
          the element it closes is still here to be closed. */}
      {/* Issue #311 re-narrows the frame: this dialog shares `add-to-list-control.tsx`'s
          picker markup and had picked up the same borrowed `border-2 border-accent` —
          the write-failure toast's own frame, on a routine, reversible pick. `border-hair`
          keeps the same weight and surface. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="bulk-add-to-list-h"
        className={`${DIALOG_FRAME} w-full max-w-[420px]`}
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
                You have no lists yet. Make one in Library → Lists, then come back.
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
                      className={`code-line shrink-0 border border-hair px-4 py-2 text-text transition-colors duration-[var(--dur-fast)] hover:bg-text hover:text-ground ${IN_FLIGHT}`}
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
