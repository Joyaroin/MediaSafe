"use client";

import { useRef } from "react";

import { actionToasts } from "@/app/(signed-in)/library/action-toast-store";
import {
  addTitleToListAction,
  removeTitleFromListAction,
  type AddTitleToListActionOutcome,
  type RemoveFromListActionOutcome,
} from "@/app/(signed-in)/lists/actions";
import type { ListDetailTitleRow } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { attemptReorder } from "./reorderable-title-list";

/**
 * Taking a title off a list — issue #357; there was no way to before. Shared by both of
 * list detail's views, so the icon grid and the reorderable list offer the same act.
 *
 * Optimistic: the row goes on the press and the rows after it close up. A lost write puts
 * it back and raises the write-failure toast (one per title, never one per attempt); a
 * landed one raises the action toast, whose Undo puts the title back where it was.
 */
export function useTakeOff({
  listId,
  listName,
  order,
  setOrder,
}: {
  readonly listId: string;
  readonly listName: string;
  readonly order: readonly ListDetailTitleRow[];
  readonly setOrder: (
    next: readonly ListDetailTitleRow[] | ((current: readonly ListDetailTitleRow[]) => readonly ListDetailTitleRow[]),
  ) => void;
}): (title: ListDetailTitleRow) => void {
  const lost = useRef(new Map<string, WriteFailureHandle>());

  function raiseLost(title: ListDetailTitleRow, reference: string | null, retry: () => void) {
    if (lost.current.get(title.titleId)?.standing()) return;
    lost.current.set(title.titleId, writeFailures.raise({ title: title.name, reference, retry }));
  }

  function settleLost(title: ListDetailTitleRow) {
    lost.current.get(title.titleId)?.resolve();
    lost.current.delete(title.titleId);
  }

  async function takeOff(title: ListDetailTitleRow) {
    const position = order.findIndex((one) => one.titleId === title.titleId) + 1;
    setOrder((current) => renumbered(current.filter((one) => one.titleId !== title.titleId)));

    const outcome = await attemptRemove(listId, title.titleId);
    if (!outcome.ok) {
      setOrder((current) => renumbered(inserted(current, title, position)));
      raiseLost(title, outcome.reference, () => void takeOff(title));
      return;
    }

    settleLost(title);
    actionToasts.raise({
      title: title.name,
      message: `Taken off ${listName}.`,
      undo: () => void putBack(title, position),
    });
  }

  /** Undo: the title goes back in at the position it came off. */
  async function putBack(title: ListDetailTitleRow, position: number) {
    setOrder((current) => renumbered(inserted(current, title, position)));

    const added = await attemptAdd(listId, title.titleId);
    const placed = added.ok ? await attemptReorder(listId, title.titleId, position) : added;
    if (!placed.ok) {
      setOrder((current) => renumbered(current.filter((one) => one.titleId !== title.titleId)));
      raiseLost(title, placed.reference, () => void putBack(title, position));
      return;
    }

    settleLost(title);
  }

  return (title) => void takeOff(title);
}

/** `title` at `position` (1-based), wherever it was before. */
function inserted(
  titles: readonly ListDetailTitleRow[],
  title: ListDetailTitleRow,
  position: number,
): ListDetailTitleRow[] {
  const copy = titles.filter((one) => one.titleId !== title.titleId);
  copy.splice(Math.min(position - 1, copy.length), 0, title);
  return copy;
}

/** Positions renumbered `1..length` in the order given, so a printed number and what is
 *  persisted never disagree. */
function renumbered(titles: readonly ListDetailTitleRow[]): ListDetailTitleRow[] {
  return titles.map((one, index) => ({ ...one, position: index + 1 }));
}

async function attemptRemove(
  listId: string,
  titleId: string,
): Promise<RemoveFromListActionOutcome> {
  try {
    return await removeTitleFromListAction(listId, titleId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
}

async function attemptAdd(listId: string, titleId: string): Promise<AddTitleToListActionOutcome> {
  try {
    return await addTitleToListAction(listId, titleId);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
}
