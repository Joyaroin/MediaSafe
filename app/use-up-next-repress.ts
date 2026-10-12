"use client";

import { useRouter, usePathname } from "next/navigation";

import { isTabRepress } from "@/app/nav-route";
import { startUpNextOver } from "@/app/restoration-memory";

/**
 * The click handler both the phone tab bar and the desktop sidebar hand their own "Up
 * next" link — issue #323's *pressing Up next while already on Up next starts the screen
 * over*. Every other tab in both files is left to navigate on its own; this is the one
 * destination that also has something to do when the reader presses it while already
 * looking at it.
 *
 * ── One hook, not two copies ──────────────────────────────────────────────────────────
 *
 * `tab-bar.tsx` and `sidebar-nav.tsx` already share `isCurrentRoute` for the reason its
 * own docblock gives: two files answering the same question independently is how the two
 * quietly disagree. The gesture below is the same shape of risk, so it is written once
 * and handed to both.
 *
 * ── What actually resets, and what does not ───────────────────────────────────────────
 *
 * This hook does three things and knows the shape of none of them:
 *
 *  - `startUpNextOver()` clears Up next's remembered place and tells every mounted rail to
 *    reset itself — `app/restoration-memory.ts` is where that happens; this file only
 *    calls the one function that starts it.
 *  - `router.refresh()` re-runs the route's Server Components, which is what makes a watch
 *    recorded elsewhere land on screen: `cache/tags.ts`'s own write paths already bust the
 *    `up-next` tag, and a refresh is what asks for the tag's current answer rather than
 *    whatever this tab happened to render on the last navigation into it.
 *  - `window.scrollTo({ top: 0 })` is the one piece of *start over* nothing else owns —
 *    there is no scroll memory for the page's own position, because none is kept.
 *
 * ── Guarded exactly as `up-next-episode-row.tsx`'s own click already is ─────────────────
 *
 * A ⌘-click, a Ctrl-click, a Shift-click, an Alt-click or a press of anything but the
 * primary button is a request *about* the link — open in a new tab, open in a new window —
 * and none of those are answered by resetting the tab the reader is already looking at.
 */
export function useUpNextRepress(): (event: React.MouseEvent<HTMLAnchorElement>) => void {
  const pathname = usePathname();
  const router = useRouter();

  return function onUpNextLinkClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (!isTabRepress(pathname, "/up-next")) return;

    event.preventDefault();
    startUpNextOver();
    router.refresh();
    window.scrollTo({ top: 0 });
  };
}
