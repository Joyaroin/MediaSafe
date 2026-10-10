"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

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
 */
let active = 0;
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

/** Hold the subtree for as long as `write` is in flight. */
export function holdOverWhile<T>(write: Promise<T>): Promise<T> {
  const release = beginHoldOver();
  return write.finally(release);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether anything is holding Watching over — what `HoldOver` reads. */
export function holdingOver(): boolean {
  return active > 0;
}

export function HoldOver({ children }: { children: ReactNode }) {
  const held = useSyncExternalStore(subscribe, holdingOver, () => false);
  const [frozen, setFrozen] = useState(children);
  /* The stored-previous-render pattern: adopt each new render while nothing holds. */
  if (!held && frozen !== children) setFrozen(children);
  return held ? frozen : children;
}
