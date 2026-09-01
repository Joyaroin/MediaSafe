import type { ReactNode } from "react";

import { BackBar } from "@/app/(signed-in)/back-bar";

/**
 * The episode route's frame — the back bar and the page's `<main>`, drawn once for all
 * three of its renders.
 *
 * ── Why this is a layout and not a line in each of the three files ──────────────────
 *
 * `page.tsx`, `error.tsx` and `loading.tsx` would otherwise draw the bar three times,
 * character for character, and the copy that drifts is the failure surface — the render
 * nobody looks at until the day it matters. A layout wraps the segment's page **and its
 * boundaries**, so one bar reaches all three without any of them knowing it exists.
 *
 * ── It reads nothing, and issue #292 is what took the read away ─────────────────────
 *
 * This file resolved the owning entry on every render of the route, for one reason: the
 * bar pointed at the show, so it needed the show's id, and `loading.tsx` is given no
 * `params` to build a link from. #289's note called that read temporary and named the
 * ticket that would remove it.
 *
 * The bar is labelled from the surface the reader arrived from now and walks history, so
 * there is no destination to compute and nothing to look up. What goes with the read is
 * the whole of its cost: a query on the route's every render, and a failure that reached
 * `app/error.tsx` rather than the `error.tsx` beside this file, because a layout sits
 * outside its own segment's boundaries. This layout is markup again.
 *
 * It also drops the case where the bar was **absent**. An episode this account does not
 * hold used to resolve to `null` and leave the frame with no way out of it, because there
 * was no show to point at; the bar names where the reader came from rather than what they
 * are looking at, so `page.tsx`'s `notFound()` is now rendered with a way back above it.
 *
 * ── This layout is not the gate ─────────────────────────────────────────────────────
 *
 * It renders no session check, for the reason `(signed-in)/layout.tsx` gives in full: a
 * layout is not re-rendered on every navigation within its group, so a check here is one
 * that runs sometimes. `page.tsx` calls `requireUserId()` itself and every read under it
 * is scoped by `ownedBy`.
 */
export default function EpisodeLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <BackBar />
      {children}
    </main>
  );
}
