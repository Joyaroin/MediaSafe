"use client";

import { LazyMotion, MotionConfig } from "motion/react";

import { smooth } from "./motion";

/**
 * One `MotionConfig` at the root, for one reason each — and one `LazyMotion` around it,
 * for a third.
 *
 * `reducedMotion="user"` is the whole of this app's reduced-motion handling for anything
 * animated by Motion. It reads the OS setting and, when it is on, drops transform and
 * layout animation while leaving opacity and colour alone. That is the behaviour
 * `globals.css` already chose for the watch sweep and the poster morph — *the event still
 * happens, it just stops moving through space* — applied globally instead of re-derived
 * per component. Doing it here rather than at call sites is what stops a new animation
 * from silently shipping without a reduced-motion path: there is no call site to forget.
 *
 * The default `transition` means a component that animates without naming one still gets
 * the system's spring instead of Motion's own default. A stray built-in easing curve is
 * the motion equivalent of a `text-[1.37rem]`.
 *
 * ── `LazyMotion`, and what it is actually buying ─────────────────────────────────────
 *
 * Every `m.*` in this application is a **mini** component: it knows how to render and
 * nothing else, and the code that makes it animate arrives separately. Without this
 * wrapper the animation runtime is imported by whichever module renders a motion
 * component — and because this provider is mounted in the root layout, that put the full
 * runtime in the first-load bundle of *every* route, including the several that animate
 * nothing at all. Settings, Import, Welcome and the error surfaces were all parsing an
 * animation engine before they were interactive.
 *
 * `features` is a function rather than the bundle itself, which is the whole trick: the
 * dynamic `import()` inside `motion-features.ts` is a chunk boundary, so the engine is
 * fetched in parallel with the page instead of blocking it. That module's docblock says
 * why it must be `domMax` rather than the smaller `domAnimation`.
 *
 * `strict` is the seam being **enforced rather than remembered**, in the same spirit as
 * `eslint.config.mjs`'s restricted imports: it throws the moment a `motion.*` component
 * renders inside this tree, so the next person to reach for the full import is told at
 * once rather than silently re-adding the bundle this removes. Every call site imports
 * `* as m from "motion/react-m"` instead.
 *
 * This exists as a client island rather than in `layout.tsx` so the root layout stays a
 * server component — it renders `<html>` and `<body>` and holds the metadata, and turning
 * all of that into a client component to set three props would push every child across
 * the boundary with it.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={() => import("./motion-features").then((mod) => mod.default)} strict>
      <MotionConfig reducedMotion="user" transition={smooth}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
