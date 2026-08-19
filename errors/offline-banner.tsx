"use client";

import { useSyncExternalStore } from "react";

import { browserConnectivitySource, createConnectivityStore } from "./connectivity";

/**
 * DESIGN.md, States: *a sticky full-width `accent` banner with `accent-ink` label type at the
 * very top of the page.*
 *
 * Blast radius decides placement (SPEC.md §6): a read failure is inline because it affects
 * one region, a write failure is a toast because it affects one action, and losing the
 * network affects everything — so this sits above everything, on every page, and is the
 * only one of the three that is not attached to something the reader did.
 *
 * It holds no logic. Whether the browser is online, and the fact that the banner clears
 * itself the moment it is, are both in `connectivity.ts` — where they can be tested
 * without a renderer.
 */

// Created once at module scope. `useSyncExternalStore` subscribes by identity, and a store
// rebuilt on each render would resubscribe on each render.
const connectivity = createConnectivityStore(browserConnectivitySource());

export function OfflineBanner() {
  const state = useSyncExternalStore(
    connectivity.subscribe,
    connectivity.get,
    connectivity.getServerSnapshot,
  );

  if (state === "online") return null;

  return (
    <div
      // Polite, not assertive: this is a condition rather than the result of an action,
      // and it must not interrupt whatever a screen reader is in the middle of.
      role="status"
      aria-live="polite"
      className="code-line sticky top-0 z-50 w-full bg-accent px-4 py-2 text-center text-accent-ink"
    >
      {/* One plain sentence, and it is honest about the consequence. SPEC.md §3.1 rules
          out an offline queue, a read cache and a service worker, so nothing is being
          held for later and saying "we'll sync when you're back" would be a lie. */}
      You are offline. Nothing will load or save until your connection is back.
    </div>
  );
}
