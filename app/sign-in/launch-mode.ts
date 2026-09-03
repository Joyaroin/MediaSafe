import type { LaunchMode } from "@/errors/sign-in-treatment";

/**
 * How this reader arrived, read from the one place that can answer it — issue #309.
 *
 * `errors/sign-in-treatment.ts` takes `LaunchMode` as a plain value on purpose, so its
 * rule can be asserted in `vitest.config.mts`'s `environment: "node"` with no DOM. This
 * is the binding that reads the DOM to produce that value, and it does nothing else —
 * the same split `app/gesture-rules.ts`'s docblock draws between a thin binding and the
 * pure rule behind it.
 *
 * Two signals, because one browser only answers one of them: `matchMedia` with
 * `display-mode: standalone` is what Android and desktop PWAs set on launch, and iOS
 * Safari predates that media query and still only answers through
 * `navigator.standalone` — undeclared on `Navigator` because it is Safari's own
 * extension, not a standard one.
 *
 * ── `useSyncExternalStore`, not `useState` + `useEffect` ─────────────────────────────
 *
 * The server has no `window` to ask, so it has to render `"browser"` and the browser has
 * to correct it. Correcting that with `setState(...)` inside an effect is the cascading
 * render `react-hooks/set-state-in-effect` rejects, and `lib/theme.ts` already refuses
 * the same shape for the same reason — this follows it exactly: the server's answer and
 * the browser's answer are two declared functions, not one patched into the other after
 * mount.
 */

/**
 * `display-mode` is the one signal of the two that can fire a `change` — a standalone
 * window has no route to become a browser tab mid-session, but the media query listener
 * is free and keeps this store honest if that ever stops being true. `navigator.standalone`
 * has no such event and is only ever read at the point something asks.
 */
export function subscribeToLaunchMode(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** What the browser reports right now. */
export function readLaunchMode(): LaunchMode {
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const iosHomeScreen =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return displayModeStandalone || iosHomeScreen ? "standalone" : "browser";
}

/**
 * What the server renders. Always `"browser"` — it has no `window` to read, and guessing
 * standalone would be a hydration mismatch rather than a better guess. It is also the
 * safe default: `errors/sign-in-treatment.ts` only changes what is shown once this is
 * corrected to `"standalone"`, so a server render never shows the browser instruction to
 * a reader who has not been confirmed to need it.
 */
export function serverLaunchMode(): LaunchMode {
  return "browser";
}
