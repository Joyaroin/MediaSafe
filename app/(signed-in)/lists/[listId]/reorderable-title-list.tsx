"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

import { reorderListAction, type ReorderListOutcome } from "@/app/(signed-in)/lists/actions";
import type { ListDetailTitleRow } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { DragHandleIcon } from "./drag-handle-icon";
import { ListTitleRow } from "./list-title-row";

/**
 * A list's rows, ordered by hand — issue #149. *"Ordering must feel direct rather than
 * administrative, so it is a drag, and it is a drag in one dimension down a column of
 * rows."*
 *
 * ── One local order, seeded once ───────────────────────────────────────────────────────
 *
 * `order` is seeded from the server read `page.tsx` was rendered with and never
 * resynced from it — the same seed-only shape `use-watch-mark.ts` uses, for the same
 * reason: this component is the only thing on the page that moves a row, so nothing else
 * knows something it does not.
 *
 * ── Following the pointer without reordering the array until it drops ─────────────────
 *
 * Reordering `order` on every pixel of pointer movement would mean every other row's
 * position is being renumbered mid-gesture — exactly the *administrative* feeling this
 * ticket is against. Instead the dragged row alone tracks the pointer, by `translateY`,
 * and `shiftFor` opens a gap by nudging whichever rows sit between the drag's start and
 * the pointer's current row by one row height. `order` itself changes exactly once, on
 * release — `commit` below — which is also the one moment position numbers move.
 *
 * ── Optimistic, the same shape as `abandon-control.tsx` ───────────────────────────────
 *
 * `commit` reorders `order` — and renumbers every row's `position` to match — before the
 * write has answered, and `persist` puts the previous order back on failure, raising the
 * write-failure toast named for the title that moved. One raised failure is tracked in
 * `raised`, exactly as `abandon-control.tsx` tracks its own: a retry that fails again has
 * nothing new to say.
 *
 * ── The keyboard path ──────────────────────────────────────────────────────────────────
 *
 * The drag handle is a real `<button>`, focusable by Tab, and `ArrowUp` / `ArrowDown`
 * move the row it names by exactly one position and commit immediately — no separate
 * grab/drop mode. `key={title.titleId}` on each row is what keeps focus on the same
 * handle across the move: React reorders the existing DOM node rather than replacing it,
 * so a reader holding Down keeps moving the same row. The `aria-live` region below
 * announces each move by name and new position, since the button's own `aria-label`
 * changing is not guaranteed to be read on its own.
 *
 * ── `dragRef` is the gesture's real state; `dragState` only re-renders from it ────────
 *
 * A fast drag can fire `pointerdown`, several `pointermove`s and `pointerup` inside one
 * browser task, before React has committed the render `pointerdown`'s `setDragState`
 * queued — which means a handler reading the *closed-over* `dragState` sees `null` for
 * the rest of that gesture and the drop never happens. `dragRef` is written synchronously
 * by every handler and is what `onHandlePointerMove` and `endDrag` actually read;
 * `setDragState` alongside it exists only to ask React to re-render the row that is
 * following the pointer. Verified by hand against a synthetic same-tick pointer sequence,
 * which reproduced the dropped gesture before this split and does not after.
 */
export function ReorderableTitleList({
  listId,
  initialTitles,
}: {
  readonly listId: string;
  readonly initialTitles: readonly ListDetailTitleRow[];
}) {
  const [order, setOrder] = useState(initialTitles);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const raised = useRef<WriteFailureHandle | null>(null);

  /**
   * Which slot the dragged row is over, from where its centre actually sits rather than
   * `translateY` divided by one row's height — `Poster` draws at each title's real
   * aspect ratio (issue #135), so rows are not a uniform height and that division put the
   * wrong row under the pointer whenever a short and a tall row traded places.
   */
  function computeHoverIndex(startIndex: number, translateY: number, fallbackHeight: number): number {
    const heights = order.map(
      (one) => rowElements.current.get(one.titleId)?.getBoundingClientRect().height ?? fallbackHeight,
    );
    const tops: number[] = [];
    let position = 0;
    for (const height of heights) {
      tops.push(position);
      position += height;
    }
    const draggedCenter = tops[startIndex] + translateY + heights[startIndex] / 2;

    let index = 0;
    let offset = 0;
    for (let i = 0; i < heights.length; i += 1) {
      if (i === startIndex) continue;
      if (draggedCenter > offset + heights[i] / 2) index += 1;
      offset += heights[i];
    }
    return clamp(index, 0, order.length - 1);
  }

  const hoverIndex = dragState ? dragState.hoverIndex : null;

  function commit(titleId: string, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const previous = order;
    const moved = previous[fromIndex];
    const next = reordered(previous, fromIndex, toIndex);
    setOrder(next);
    setAnnouncement(`${moved.name} moved to position ${toIndex + 1} of ${next.length}.`);
    void persist(titleId, toIndex + 1, previous, moved.name);
  }

  async function persist(
    titleId: string,
    newPosition: number,
    previous: readonly ListDetailTitleRow[],
    titleName: string,
  ) {
    const outcome = await attemptReorder(listId, titleId, newPosition);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      return;
    }

    setOrder(previous);

    if (raised.current) return;
    raised.current = writeFailures.raise({
      title: titleName,
      reference: outcome.reference,
      retry: () => void persist(titleId, newPosition, previous, titleName),
    });
  }

  function onHandlePointerDown(event: PointerEvent<HTMLButtonElement>, index: number, titleId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Without this, the browser's own text-selection drag races the pointer capture
    // below and wins on desktop: a press-and-drag over `Poster`'s image and the row's
    // text is exactly the gesture a mouse uses to select text, and pointer capture alone
    // does not suppress it.
    event.preventDefault();
    const rowHeight = rowElements.current.get(titleId)?.getBoundingClientRect().height ?? 64;
    try {
      // Without capture, `onHandlePointerMove` stops firing the moment the pointer
      // leaves this 20px handle — which a real drag does almost immediately. A browser
      // that cannot grant it (verified by hand: it throws for a pointer id the browser
      // does not consider live) still gets a drag, just one that can only track the
      // pointer while it stays over the handle rather than the whole row.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // See above — proceed without capture rather than losing the gesture entirely.
    }
    const next: DragState = {
      titleId,
      startIndex: index,
      pointerId: event.pointerId,
      startY: event.clientY,
      translateY: 0,
      rowHeight,
      hoverIndex: index,
    };
    dragRef.current = next;
    setDragState(next);
  }

  function onHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const translateY = event.clientY - current.startY;
    const next = {
      ...current,
      translateY,
      hoverIndex: computeHoverIndex(current.startIndex, translateY, current.rowHeight),
    };
    dragRef.current = next;
    setDragState(next);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    dragRef.current = null;
    setDragState(null);
    commit(current.titleId, current.startIndex, current.hoverIndex);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number, titleId: string) {
    if (dragRef.current) return;
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      commit(titleId, index, index - 1);
    } else if (event.key === "ArrowDown" && index < order.length - 1) {
      event.preventDefault();
      commit(titleId, index, index + 1);
    }
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <ul className="px-6">
        {order.map((title, index) => {
          const shift = shiftFor(index, dragState, hoverIndex);
          const style: CSSProperties | undefined =
            dragState && dragState.titleId === title.titleId
              ? {
                  position: "relative",
                  zIndex: 20,
                  touchAction: "none",
                  transform: `translateY(${dragState.translateY}px)`,
                }
              : shift === 0
                ? undefined
                : {
                    position: "relative",
                    transform: `translateY(${shift}px)`,
                    transition: "transform 150ms ease",
                  };

          return (
            <ListTitleRow
              key={title.titleId}
              title={title}
              style={style}
              liRef={(element) => {
                if (element) rowElements.current.set(title.titleId, element);
                else rowElements.current.delete(title.titleId);
              }}
              dragHandle={
                <button
                  type="button"
                  aria-label={`Reorder ${title.name}, position ${index + 1} of ${order.length}`}
                  className="touch-none cursor-grab select-none p-2 text-dim transition-colors duration-150 hover:text-text active:cursor-grabbing"
                  onPointerDown={(event) => onHandlePointerDown(event, index, title.titleId)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(event) => onHandleKeyDown(event, index, title.titleId)}
                >
                  <DragHandleIcon className="h-5 w-5" />
                </button>
              }
            />
          );
        })}
      </ul>
    </>
  );
}

interface DragState {
  readonly titleId: string;
  readonly startIndex: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly translateY: number;
  readonly rowHeight: number;
  /** Recomputed on every `pointermove` so render never has to read `rowElements` — a
   *  ref — during render itself. */
  readonly hoverIndex: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The new order, with `position` renumbered `1..length` to match — the one place that
 *  arithmetic happens, so a row's printed number and what gets persisted never disagree. */
function reordered(
  titles: readonly ListDetailTitleRow[],
  fromIndex: number,
  toIndex: number,
): ListDetailTitleRow[] {
  const copy = titles.slice();
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy.map((one, index) => ({ ...one, position: index + 1 }));
}

/** How far row `index` shifts to open a gap for the row being dragged, in pixels — zero
 *  for everything outside the range between the drag's start and where the pointer is
 *  now. */
function shiftFor(index: number, dragState: DragState | null, hoverIndex: number | null): number {
  if (!dragState || hoverIndex === null || hoverIndex === dragState.startIndex) return 0;

  if (dragState.startIndex < hoverIndex) {
    return index > dragState.startIndex && index <= hoverIndex ? -dragState.rowHeight : 0;
  }

  return index >= hoverIndex && index < dragState.startIndex ? dragState.rowHeight : 0;
}

async function attemptReorder(
  listId: string,
  titleId: string,
  newPosition: number,
): Promise<ReorderListOutcome> {
  try {
    return await reorderListAction(listId, titleId, newPosition);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "lists" }) };
  }
}
