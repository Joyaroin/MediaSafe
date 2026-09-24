"use client";

/**
 * The display name the signed-in shell shows, after Settings has changed it — issue #179.
 *
 * The directive above is the same safety boundary `errors/write-failure.ts` and
 * `app/(signed-in)/library/watch-marks.ts` draw, for the same reason: `displayName` at the
 * bottom of this file is one module-level object, and module state on the server is shared
 * by every request and so by every account. One reader's name rendered into another
 * reader's masthead is not a mistake this product can survive, and
 * `"use client"` turns it into a build-time client-reference error rather than a silent
 * leak. `getServerSnapshot()` returning `null` is the second half of that guard.
 *
 * ── What this replaces, and why it is not a cache ────────────────────────────────────
 *
 * `masthead.tsx` and `sidebar.tsx` both read `currentDisplayName()` on the server, and
 * they live in `(signed-in)/layout.tsx` — a layout, which the client Router Cache keeps
 * and reuses across navigations even though every page segment under it is dynamic and is
 * refetched (Next.js 15's client-cache change: *page segments are no longer reused …
 * layouts and loading states continue to be cached*). So a name saved in Settings really
 * did have no way of reaching those two `<span>`s on its own.
 *
 * `display-name-control.tsx` answered that with `router.refresh()`, which re-renders the
 * whole route tree and re-runs every read on the page — the session read included — to
 * move one string. This store is the narrower answer, and the one issue #176 asks for:
 * *server actions should return the updated data directly where the caller can apply it.*
 * The caller already has the name it just saved; it publishes it, and the two cells read
 * it.
 *
 * It is **not** a cache of the session and must never grow into one. It holds exactly what
 * a browser has saved since this page loaded, `null` otherwise, and a page load clears it —
 * at which point the server's own read is what renders.
 *
 * ── The one staleness it can produce, stated rather than denied ──────────────────────
 *
 * Once set, this outranks every later server read for the rest of the page session. So a
 * name changed on **another device** does not reach this tab's masthead while it stays
 * open, even across client navigations: the store is newer than nothing it knows about.
 * The bound is therefore *it cannot show a name older than the last one saved here*, which
 * is weaker than *never stale* and is the true claim. That is the same trade
 * `watch-marks.ts` makes and argues at length — a surface that has written to something is
 * the only thing that knows what it wrote — and the cost here is smaller, because the
 * losing value is a name this reader chose on their own other device.
 *
 * ── Why one account's name cannot reach another's shell ─────────────────────────────
 *
 * Worth stating because it rests on something outside this file. Signing out is a client
 * navigation (`settings/sign-out-button.tsx`), so this store survives it — but signing in
 * is a full-page redirect to Google (`app/sign-in/sign-in-surface.tsx`), which destroys
 * the JS context and this object with it. There is no path from one account's save to
 * another account's masthead that does not pass through that redirect. If sign-in ever
 * stops being a full-page navigation, this store needs a `clear()` on sign-out and this
 * paragraph is the reason.
 */

export interface DisplayNameStore {
  subscribe(onChange: () => void): () => void;
  /** The name saved from Settings since this page loaded, or `null` if none has been. */
  get(): string | null;
  getServerSnapshot(): null;
  /** Publish a name that has just been confirmed by the server. Never an optimistic one. */
  set(name: string): void;
}

export function createDisplayNameStore(): DisplayNameStore {
  let saved: string | null = null;
  const listeners = new Set<() => void>();

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    get() {
      return saved;
    },

    // There is no browser-saved name on the server, and `null` is the only answer that is
    // true for every request — see the module docblock on why anything else leaks.
    getServerSnapshot() {
      return null;
    },

    set(name) {
      // A save that changes nothing must not notify: `useSyncExternalStore` re-renders
      // every subscriber on every notification, so a no-op that speaks is a re-render
      // that draws the string already on screen.
      if (name === saved) return;
      saved = name;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * The app's one store. Module-level rather than a React context for the reason
 * `watch-marks.ts` gives about its own: the writer is in `(signed-in)/settings/` and the
 * readers are in `(signed-in)/layout.tsx`'s masthead and sidebar, so a provider would have
 * to be mounted above the whole signed-in shell by a component with no other reason to
 * know Settings exists.
 */
export const displayName = createDisplayNameStore();
