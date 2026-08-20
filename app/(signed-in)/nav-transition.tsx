import { ViewTransition } from "react";

/**
 * The phone's own enter/exit, wrapped once and used by every screen that participates.
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
 * It is also what makes the slide phone-only with no media query in it. The only two
 * places that attach `nav-forward`/`nav-back` are `tab-bar.tsx` and `masthead.tsx`'s
 * Settings entrance, and both are `lg:hidden`; a desktop navigation — from
 * `sidebar-nav.tsx`, which carries the same destinations and the same Settings link —
 * attaches no type at all, lands on `default`, and gets exactly the nothing it got before.
 */
const NAV_DIRECTIONS = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
} as const;

export function NavTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={NAV_DIRECTIONS} exit={NAV_DIRECTIONS} default="none">
      {children}
    </ViewTransition>
  );
}
