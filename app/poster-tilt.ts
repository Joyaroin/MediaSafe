"use client";

import { useEffect } from "react";

/**
 * Posters lean toward the pointer on a desktop — the UI overhaul's *CSS depth*, and the
 * only depth on the screen. Hover-only: on a phone there is no hover, a gyroscope would
 * need a permission prompt on iOS, and a poster moving under a scrolling thumb is harder
 * to read. Lists stay flat until the pointer is actually on one.
 *
 * One document listener rather than a handler per poster, for `usePressMarks`' reason:
 * there are hundreds of posters and one pointer. It writes two custom properties and a
 * `data-tilting` mark; `globals.css` is what they mean, so reduced motion is a CSS rule
 * rather than a branch here.
 */
const FINE_HOVER = "(hover: hover) and (pointer: fine)";
/** Degrees at the poster's edge. Enough to read as depth, not enough to read as a card trick. */
const MAX_TILT = 7;

export function usePosterTilt(): void {
  useEffect(() => {
    if (!window.matchMedia(FINE_HOVER).matches) return;

    let current: HTMLElement | null = null;
    let frame = 0;

    function rest(): void {
      if (current === null) return;
      current.removeAttribute("data-tilting");
      current.style.removeProperty("--tilt-x");
      current.style.removeProperty("--tilt-y");
      current = null;
    }

    function onPointerMove(event: PointerEvent): void {
      if (event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target : null;
      const poster = target?.closest<HTMLElement>(".poster") ?? null;
      if (poster !== current) rest();
      if (poster === null) return;

      const { clientX, clientY } = event;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = poster.getBoundingClientRect();
        const x = (clientX - box.left) / box.width - 0.5;
        const y = (clientY - box.top) / box.height - 0.5;
        poster.style.setProperty("--tilt-x", `${(-y * MAX_TILT * 2).toFixed(2)}deg`);
        poster.style.setProperty("--tilt-y", `${(x * MAX_TILT * 2).toFixed(2)}deg`);
        poster.setAttribute("data-tilting", "true");
        current = poster;
      });
    }

    function onLeave(): void {
      cancelAnimationFrame(frame);
      rest();
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      onLeave();
    };
  }, []);
}
