"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * Keeps Watching on screen as it was while a card holds or a card's write is in flight —
 * issue #367.
 *
 * A mark or an Undo is a Server Action that busts `up-next` with `updateTag`, so its
 * response carries this page re-rendered. When the press finished something — the last
 * aired episode of a season, a film off the watchlist — that render no longer has the card
 * in it, and on a fast server it lands well inside `HOLD_MS`: the card vanished with its
 * finish line and its *Undo* still on screen, and an *Undo* then flickered the card out and
 * back while its own write was on the wire.
 *
 * So while anything is holding, the subtree is drawn from the last render taken before the
 * hold began, and the newest one is swapped in the moment nothing is. Nothing is dropped:
 * the newest server render is what shows once the hold and every write behind it are done.
 *
 * ── A write is done when its render has landed, not when its promise has ─────────────
 *
 * The action's promise resolves before the router commits the render it carries. Letting
 * go at the promise drew, for that gap, whatever render was newest *before* it — after an
 * Undo, the mark's own render, whose run starts one episode later. A check pressed in that
 * gap was labelled episode 2 and recorded episode 3. So a settled write keeps the subtree
 * held until the next server render arrives (`HoldOver`'s effect), or, for a write that
 * brings none — a lost one — until `RENDER_WAIT_MS` passes.
 */
let active = 0;
let awaitingRender = false;
let renderWait: ReturnType<typeof setTimeout> | null = null;

/** The longest a settled write waits for its render before the subtree lets go anyway. */
const RENDER_WAIT_MS = 1_500;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Hold the subtree until the returned release is called (idempotent). */
export function beginHoldOver(): () => void {
  active += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
    emit();
  };
}

/** Hold the subtree for as long as `write` is in flight, and until its render lands. */
export function holdOverWhile<T>(write: Promise<T>): Promise<T> {
  const release = beginHoldOver();
  return write.finally(() => {
    awaitRender();
    release();
  });
}

function awaitRender(): void {
  awaitingRender = true;
  if (renderWait !== null) clearTimeout(renderWait);
  renderWait = setTimeout(renderLanded, RENDER_WAIT_MS);
}

/** The render a settled write was waiting for has arrived, or will not. */
function renderLanded(): void {
  if (renderWait !== null) clearTimeout(renderWait);
  renderWait = null;
  if (!awaitingRender) return;
  awaitingRender = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether anything is holding Watching over — what `HoldOver` reads. */
export function holdingOver(): boolean {
  return active > 0 || awaitingRender;
}

export function HoldOver({ children }: { children: ReactNode }) {
  const held = useSyncExternalStore(subscribe, holdingOver, () => false);
  const [frozen, setFrozen] = useState(children);
  /* A new server render has arrived: whatever write was waiting for one has it. */
  useEffect(() => {
    renderLanded();
  }, [children]);
  /* The stored-previous-render pattern: adopt each new render while nothing holds. */
  if (!held && frozen !== children) setFrozen(children);
  return held ? frozen : children;
}
