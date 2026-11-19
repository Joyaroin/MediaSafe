import { useEffect, type RefObject } from "react";

/**
 * Opens the page at the element its address names, when the browser did not.
 *
 * ── Why the browser's own fragment scroll is not enough (issue #619) ───────────────────
 *
 * On a full load of `/titles/{id}?from=search#episodes` the title page's content is behind
 * the route's `loading.tsx` boundary, so it arrives as a streamed chunk: React sends it in
 * a hidden staging node and a small inline script swaps it into place. The browser only
 * keeps trying to scroll to a fragment while the document is still parsing. If the swap
 * lands after `DOMContentLoaded` the browser has already given up, and the page sits at
 * the top with the episode list a screen below. Measured on the phone viewport: 12 of 12
 * loads scrolled when the swap came before `DOMContentLoaded` and none did when it came
 * after, and the swap is a few milliseconds either side of it.
 *
 * So the page asks again once the element is really mounted. It does it only when the
 * reader has not moved (`scrollY` is 0) and only for the id the address names, so it
 * never fights the browser when the browser got there first, and never pulls a reader
 * back who has already started scrolling.
 */
export function useOpenAtFragment(id: string, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    if (window.scrollY > 0) return;
    ref.current?.scrollIntoView();
  }, [id, ref]);
}
