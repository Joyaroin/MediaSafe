"use client";

import { MotionConfig } from "motion/react";

import { smooth } from "./motion";

/**
 * One `MotionConfig` at the root, for one reason each.
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
 * This exists as a client island rather than in `layout.tsx` so the root layout stays a
 * server component — it renders `<html>` and `<body>` and holds the metadata, and turning
 * all of that into a client component to set two props would push every child across the
 * boundary with it.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={smooth}>
      {children}
    </MotionConfig>
  );
}
