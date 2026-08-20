import { ViewTransition } from "react";

/**
 * The four phone tabs' own enter/exit, wrapped once and used four times.
 *
 * ── Why this is a component and not a line in the layout ─────────────────────────────
 *
 * It has to sit inside each `page.tsx`. A layout **persists across navigations within its
 * group**, so a `ViewTransition` placed in `(signed-in)/layout.tsx` would never unmount
 * and never mount — its enter and exit would simply never fire. Next's own guide says so
 * in as many words: *"Put the wrapper in each `page.tsx`, not the layout."* What is shared
 * here is the mapping, not the position.
 *
 * ── `default: "none"` on both, and it is load-bearing twice over ─────────────────────
 *
 * A named or classed `ViewTransition` otherwise animates during **every** transition on
 * the page, not just its own. Without these two defaults, every one of these four pages
 * would slide during the poster morph (#141) and during any Suspense reveal — which is
 * both wrong to look at and a fight between two animations for the same pixels.
 *
 * It is also what makes the slide phone-only with no media query in it. Only
 * `tab-bar.tsx` attaches `tab-forward`/`tab-back`, and that bar is `lg:hidden`; a desktop
 * navigation from `sidebar-nav.tsx` carries no type at all, lands on `default`, and gets
 * exactly the nothing it got before.
 */
const TAB_DIRECTIONS = {
  "tab-forward": "tab-forward",
  "tab-back": "tab-back",
  default: "none",
} as const;

export function TabTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={TAB_DIRECTIONS} exit={TAB_DIRECTIONS} default="none">
      {children}
    </ViewTransition>
  );
}
