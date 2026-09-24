"use client";

import { useEffect, useRef, useState } from "react";

import type { BulkSelection, SelectableTitle } from "./bulk-selection";

/**
 * The hold gesture itself — issue #197, and since #198 shared rather than copied a second
 * time.
 *
 * `selectable-entry.tsx` had this as its own state and its own three handlers; the phone's
 * group tile
 * needed the identical thing against a track that scrolls instead of a grid that does not,
 * and the first pass at #198 typed the whole state machine out again rather than moving it —
 * the two-axis review of #198 named that duplication and this is the fix. Nothing about the
 * mechanism was ever specific to a bill cell: it was already just *the finger stayed still
 * for `HOLD_MS`, within `HOLD_SLOP_PX`*, and both call sites want exactly that.
 *
 * ── What stays local to each caller ───────────────────────────────────────────────────
 *
 * What a landed tap or a swallowed click *does next* differs by surface — a bill cell
 * either selects the desktop pane or pushes a route; a group tile either opens the sheet or
 * lets a `<Link>`'s own navigation run — so `onClick` is not this hook's to own.
 * `consumeSwallowedClick()` is the seam: a caller's own `onClick` asks it first, and only
 * builds its own answer when it comes back `false`.
 */
export interface HoldGesture {
  /** The press itself — `data-holding`'s value, mid-timer with the finger still down. */
  readonly holding: boolean;
  /** The overshoot — `data-landed`'s value, playing out after the hold lands. */
  readonly landed: boolean;
  /**
   * `true` once, for the one click the browser sends when a landed hold's finger lifts —
   * and only once: calling this clears it, so a caller's own `onClick` can ask *was this
   * click already spoken for* without either of them keeping a second flag.
   */
  consumeSwallowedClick(): boolean;
  /** Spread onto the element the gesture is held against — a `<button>` or a `<Link>`
   *  alike, since neither handler reaches for anything specific to either element. */
  readonly handlers: {
    onPointerDown(event: React.PointerEvent): void;
    onPointerMove(event: React.PointerEvent): void;
    onPointerUp(): void;
    onPointerCancel(): void;
    onPointerLeave(): void;
    onContextMenu: ((event: React.MouseEvent) => void) | undefined;
    onAnimationEnd(event: React.AnimationEvent): void;
  };
}

/**
 * How long a finger has to stay down. `500ms` is the platform's own long-press — iOS and
 * Android both settle around it — and the ticket's *around half a second*. Shorter turns
 * a slow tap into a selection; longer and the reader lets go before anything happens and
 * concludes the gesture does not exist.
 */
export const HOLD_MS = 500;

/**
 * How far the pointer may drift and still count as held. A finger resting on a phone moves
 * a few pixels on its own; a scroll moves many more, and a grid of 472 cells — or a track
 * flicked sideways with a thumb — is moved far more often than it is held. This is also
 * #198's whole answer to *a press that becomes a drag must not select*: a flick crosses
 * `10px` well before the timer would land, so the same slop that protects a vertical scroll
 * protects a horizontal one without a second rule.
 */
export const HOLD_SLOP_PX = 10;

/**
 * What a cell or tile that can be held has to give up, and it is all about the browser's
 * own answers to a long press.
 *
 * `select-none` stops the text-selection drag over the title. `-webkit-touch-callout` is
 * the one that matters on the device this feature is for: a long press on an `<img>` in
 * iOS Safari raises *Save Image* / *Copy*, and every artwork this gesture is held against —
 * the bill's poster, a group tile's poster — is one, so without this the gesture's own
 * headline press opens a system sheet over the thing it was meant to select.
 *
 * Added **only where the gesture exists**. On the desktop a reader can still select a
 * title's text and still right-click its artwork, exactly as before.
 */
export const HOLDABLE = "select-none [-webkit-touch-callout:none]";

/**
 * The ring on a selected cell or tile — **`--ink`, and not the accent issue #197 asked
 * for.**
 *
 * `app/globals.css`'s accent block refuses it in as many words — *"Not focus, selection or
 * the caret … they use brightness and border weight off `--text`, so a colour spent on
 * focus state is not a colour that also means 'this was marked'"* — and the collision it
 * guards against is not hypothetical at either call site: the bill paints **Watching** in
 * the accent inside the very cell this ring would sit in, and a group heading was
 * Up next's one accent role on the screen a group tile sits on. An accent ring around either
 * would be two accent roles at once, which the rule names as the exact failure it exists to
 * prevent.
 *
 * `outline`, not a border and not a shadow: a `2px` border occupies layout and would move a
 * selected cell's contents against its neighbours'; *no drop shadows at all*
 * rules out the usual answer to that. `outline` costs no layout and is not a shadow, so
 * both hold. The negative offset draws it inside the border box, so whichever box actually
 * clips to a corner at each call site — the bill cell's own `li`, a group tile's poster —
 * is what gives the ring its radius; this never restates one.
 */
export const SELECTED = "outline-2 -outline-offset-2 outline-text";

/**
 * `bulk` is read once per call rather than closed over from a stable reference, because
 * every caller already re-derives it every render from `useBulkSelection()` — a `null` on
 * the desktop, always. `title` likewise: a fresh value each render is exactly what a hold
 * started this render should act on.
 */
/**
 * **The gesture, with nothing about selection in it** — issue: the episode row and the Up
 * next row want a hold too, and what they want it to *do* is open a menu.
 *
 * Extracted rather than copied, which is `episode-line.ts`'s rule for exactly this shape
 * of thing: the `500ms`, the `10px` slop, the swallowed click, the unmount cleanup and the
 * `animationend` guard are five decisions each with a paragraph behind them, and a second
 * hold that re-derived four of them would differ from this one in the fifth without
 * anybody noticing.
 *
 * `onLand` is `null` where the surface has no hold — the library grid outside a selection
 * provider — and that null is what turns the whole gesture off, `onContextMenu`
 * suppression included.
 */
export function useHoldGesture(onLand: (() => void) | null): HoldGesture {
  const [holding, setHolding] = useState(false);
  const [landed, setLanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** The hold landed and the browser's own click has not been swallowed yet. */
  const swallowClick = useRef(false);

  function cancelHold(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
    setHolding(false);
  }

  // A cell or tile can be unmounted mid-hold — the Library's filter field narrowing the
  // grid under the reader's finger, a route left before the timer lands. Without this the
  // timer still fires, into a store that is still very much alive, and a title the reader
  // can no longer see joins the selection.
  useEffect(() => cancelHold, []);

  function onPointerDown(event: React.PointerEvent): void {
    if (onLand === null) return;
    // Cleared here as well as on `animationend`, and the reason is
    // `prefers-reduced-motion`: `globals.css` sets `animation: none` there, so no
    // `animationend` is ever fired and the attribute set by the last hold would stay on
    // this element for the life of the mount. That is invisible while the reader's setting
    // holds, and stops being invisible the moment they turn it off — the media query stops
    // matching, the rule underneath it applies to an element already carrying the
    // attribute, and it pops on its own with nothing touching it.
    setLanded(false);
    swallowClick.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      origin.current = null;
      swallowClick.current = true;
      setHolding(false);
      setLanded(true);
      onLand();
    }, HOLD_MS);
  }

  function onPointerMove(event: React.PointerEvent): void {
    const from = origin.current;
    if (from === null) return;
    if (
      Math.abs(event.clientX - from.x) <= HOLD_SLOP_PX &&
      Math.abs(event.clientY - from.y) <= HOLD_SLOP_PX
    ) {
      return;
    }
    cancelHold();
  }

  return {
    holding,
    landed,
    consumeSwallowedClick() {
      if (!swallowClick.current) return false;
      swallowClick.current = false;
      return true;
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancelHold,
      onPointerCancel: cancelHold,
      onPointerLeave: cancelHold,
      // A long press on a phone otherwise raises the text-selection callout over the
      // element the reader is holding, which is the browser answering a gesture this app
      // has just claimed. Suppressed only where the gesture exists.
      onContextMenu: onLand === null ? undefined : (event) => event.preventDefault(),
      // `currentTarget === target` only: a check badge mounted inside plays its own
      // arrival, and an `animationend` bubbling up from it would clear this one's
      // overshoot part-way through.
      onAnimationEnd: (event) => {
        if (event.currentTarget === event.target) setLanded(false);
      },
    },
  };
}

/**
 * Hold to select — the gesture above, landing on `bulk.hold`.
 *
 * This is the whole of what the hook used to be; the body moved up so that a second
 * surface could land the same press somewhere else. `SelectableEntry` calls this and is
 * unchanged, including the `null` bulk case: no provider, no hold.
 */
export function useHoldToSelect(
  bulk: BulkSelection | null,
  title: SelectableTitle,
): HoldGesture {
  return useHoldGesture(bulk === null ? null : () => bulk.hold(title));
}
