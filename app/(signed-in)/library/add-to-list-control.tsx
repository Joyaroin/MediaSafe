"use client";

import { useRef, useState } from "react";

import {
  addTitleToListAction,
  createListAndAddTitleAction,
  listsForPickerAction,
  type AddTitleToListActionOutcome,
  type CreateListAndAddOutcome,
  type ListsForPickerOutcome,
} from "@/app/(signed-in)/lists/actions";
import { ListNameForm } from "@/app/(signed-in)/lists/list-name-form";
import { DIALOG_FRAME, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/buttons";
import type { ListSummary } from "@/db/access";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { CheckmarkIcon } from "./checkmark-icon";

/** On a phone, pinned to the bottom edge and full width with its lower corners square;
 *  from `lg:` the centred dialog `DIALOG_FRAME` already is. */
const SHEET =
  "w-full max-w-[420px] max-lg:mt-auto max-lg:mb-0 max-lg:max-w-none max-lg:rounded-b-[var(--radius-none)] max-lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]";

/**
 * *Add to list*, whole — the trigger and the picker in one component, issue #147.
 *
 * ── One file, not a trigger split from a dialog ───────────────────────────────────────
 *
 * `list-row.tsx` hands `delete-list-dialog.tsx` a ref because that dialog's rows are
 * static props with nothing to fetch. This dialog fetches its own picker rows the moment
 * it opens, so the press that opens it and the fetch that follows have to happen
 * together — a `<dialog>` fires no reliable "now open" event across browsers to hook a
 * second component into, and inventing one would be more machinery than the alternative:
 * a control that fetches on open is one file, trigger and dialog together. It follows that
 * rather than `list-row.tsx`'s split, which only fits a dialog with nothing to load.
 * (`RatingControl` and `AbandonControl` were the two precedents named here; both are
 * retired, and the reason they were single files is the reason stated above.)
 *
 * ── Creating a list is the same action ────────────────────────────────────────────────
 *
 * The issue's own words: *creating a new list is available in the same action, so the
 * first list is not a separate errand.* The name field sits above the picked-from-existing
 * rows rather than behind a second control, and submitting it both makes the list and adds
 * this title to it in one server round trip (`createListAndAddTitleAction`,
 * `db/access.ts`'s `createListAndAddTitle`) — there is no moment where a freshly named
 * list exists and this title is not yet in it.
 *
 * ── Optimistic per row, keyed by list id ──────────────────────────────────────────────
 *
 * Every row can be pressed independently, so the single `useRef<WriteFailureHandle>` every
 * other optimistic control in this codebase uses is not enough — a `Map` keyed by list id
 * is the same mechanism, one handle per outstanding write instead of one for the whole
 * component. `AGENTS.md`'s **one toast per lost write, not one per attempt** still holds,
 * per row: a second press on a row whose toast is still standing raises nothing new.
 *
 * A row's own membership before this dialog opened is not read back — `listsForPickerAction`
 * answers `ListSummary`, the same shape the Lists page itself reads, with no per-title
 * join. Pressing a list this title is already in is exactly issue #147's *not an error and
 * not a duplicate*: the write lands, the row's tick fills, and nothing about the list
 * changes twice.
 *
 * ── A sheet, with a tick per list — Charcoal, handoff §8.5 ───────────────────────────
 *
 * On a phone the dialog rises from the bottom edge as a sheet; from `lg:` it is the same
 * centred dialog every other one is. Each list is one row and the row is the button: a
 * ring at its end that fills (`text` fill, `ground` glyph — the tick's watched form, §6)
 * once the title is on that list. The behaviour is unchanged: a press adds, a filled row
 * has nothing left to do and says so with `aria-pressed`, and *Done* closes.
 *
 * ── Remounted per title ────────────────────────────────────────────────────────────────
 *
 * `programme-note-content.tsx` keys this component on `detail.titleId`. The desktop pane
 * never navigates (`programme-note.tsx`'s own docblock), so a reader can open this dialog
 * for one title, close it, select a different one, and open it again — a `key` change is
 * what gives every title a clean picked set and a clean fetch rather than several pieces
 * of local state this file would otherwise have to reset by hand on every prop change. A
 * write still in flight when the key changes keeps running — `catalogue-result.tsx`'s own
 * docblock covers why that is safe: the toast it raises on failure is module state that
 * outlives this instance, so a lost write is still reported even once nobody is looking at
 * this dialog's own rows any more.
 */
type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly lists: readonly ListSummary[] }
  | { readonly kind: "failed"; readonly reference: string | null };

export function AddToListControl({
  titleId,
  titleName,
}: {
  readonly titleId: string;
  readonly titleName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const handles = useRef(new Map<string, WriteFailureHandle>());

  function openDialog(): void {
    dialogRef.current?.showModal();
    setAdded(new Set());
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

  async function addTo(listId: string): Promise<void> {
    setPending((current) => new Set(current).add(listId));
    setAdded((current) => new Set(current).add(listId));

    const outcome = await add(listId, titleId);

    setPending((current) => {
      const next = new Set(current);
      next.delete(listId);
      return next;
    });

    if (outcome.ok) {
      handles.current.get(listId)?.resolve();
      handles.current.delete(listId);
      return;
    }

    setAdded((current) => {
      const next = new Set(current);
      next.delete(listId);
      return next;
    });

    if (handles.current.get(listId)?.standing()) return;
    handles.current.set(
      listId,
      writeFailures.raise({
        title: titleName,
        reference: outcome.reference,
        retry: () => void addTo(listId),
      }),
    );
  }

  return (
    <div>
      {/* A secondary button: it opens a dialog, nothing more, and it sits beside the
          title's one main action rather than competing with it. */}
      <button
        type="button"
        onClick={openDialog}
        aria-label={`Add ${titleName} to a list`}
        className={SECONDARY_BUTTON}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add to list
      </button>

      {/* Issue #311 re-narrows the frame: this was named one of the two
          dialogs borrowing the write-failure toast's `border-2 border-accent` for a
          routine, reversible action. `border-hair` keeps the same weight and surface. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`add-to-list-${titleId}-h`}
        className={`${DIALOG_FRAME} ${SHEET}`}
      >
        <h2 id={`add-to-list-${titleId}-h`} className="bill-title text-bill-lg text-text">
          Add &ldquo;{titleName}&rdquo; to a list
        </h2>

        <ListNameForm
          fieldId="add-to-list-new-name"
          fieldClassName="flex-1"
          inputClassName="w-full"
          formClassName="mt-4"
          submitClassName={PRIMARY_BUTTON}
          pendingLabel="Adding"
          toastTitle={() => titleName}
          submit={(name) => createAndAdd(name, titleId)}
          onCreated={(list) => {
            setPhase((current) =>
              current?.kind === "loaded"
                ? {
                    kind: "loaded",
                    lists: [...current.lists, list].sort((a, b) => a.name.localeCompare(b.name)),
                  }
                : current,
            );
            setAdded((current) => new Set(current).add(list.id));
          }}
        />

        <div className="mt-3">
          {phase === null || phase.kind === "loading" ? (
            <p role="status" className="py-3 text-note text-dim">
              Reading your lists
            </p>
          ) : null}

          {phase?.kind === "failed" ? (
            <ReadFailure reference={phase.reference} retry={() => void read()} />
          ) : null}

          {phase?.kind === "loaded" ? (
            phase.lists.length === 0 ? (
              <p className="text-note leading-relaxed text-dim">
                Name a list above to put &ldquo;{titleName}&rdquo; in it.
              </p>
            ) : (
              <ul className="divide-y divide-hair">
                {phase.lists.map((list) => (
                  <ListPickerRow
                    key={list.id}
                    list={list}
                    added={added.has(list.id)}
                    pending={pending.has(list.id)}
                    onAdd={() => void addTo(list.id)}
                  />
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={SECONDARY_BUTTON}
          >
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}

function ListPickerRow({
  list,
  added,
  pending,
  onAdd,
}: {
  readonly list: ListSummary;
  readonly added: boolean;
  readonly pending: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <li>
      {/* Pressed once the title is on the list, and then inert: there is no take-off
          here, as there was none before (`add-to-list-control.tsx`'s behaviour). */}
      <button
        type="button"
        onClick={added ? undefined : onAdd}
        disabled={pending}
        aria-pressed={added}
        aria-label={added ? `${list.name}, added` : `Add to ${list.name}`}
        className="flex min-h-[52px] w-full items-center justify-between gap-4 text-left disabled:cursor-wait"
      >
        <span className="min-w-0 truncate text-bill-xs font-medium text-text">{list.name}</span>
        <span
          aria-hidden="true"
          className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--radius-full)] transition-colors duration-[var(--dur-fast)] ${
            added ? "bg-text text-ground" : "text-dim ring-[1.5px] ring-dim ring-inset"
          }`}
        >
          <CheckmarkIcon className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}

async function readLists(): Promise<ListsForPickerOutcome> {
  try {
    return await listsForPickerAction();
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "add-to-list" }) };
  }
}

async function add(listId: string, titleId: string): Promise<AddTitleToListActionOutcome> {
  try {
    return await addTitleToListAction(listId, titleId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "add-to-list" }) };
  }
}

async function createAndAdd(name: string, titleId: string): Promise<CreateListAndAddOutcome> {
  try {
    return await createListAndAddTitleAction(name, titleId);
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      reference: referenceFor(error, { surface: "add-to-list" }),
    };
  }
}
