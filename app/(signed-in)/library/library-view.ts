/**
 * Library's three tabs — issue #357: Shows, Films and Lists. Lists used to be a destination
 * of its own that a phone could not reach until a list already existed; it is a tab here
 * now, so everything a reader keeps is in one place.
 *
 * The chosen tab is remembered per reader, on this device, the way the theme override and
 * a list's view are — it used to reset to Shows on every visit. A link can still name a
 * tab (`/library?view=lists`), which is where a list's back control leads.
 *
 * Not `"use client"`: the parse and the list are pure and read on the server too. The
 * remembered half touches `window` only inside functions a client calls.
 */

export const LIBRARY_VIEWS = [
  { value: "show", label: "Shows" },
  { value: "film", label: "Films" },
  { value: "lists", label: "Lists" },
] as const;

export type LibraryView = (typeof LIBRARY_VIEWS)[number]["value"];

export const DEFAULT_LIBRARY_VIEW: LibraryView = "show";

function isLibraryView(value: unknown): value is LibraryView {
  return LIBRARY_VIEWS.some((view) => view.value === value);
}

/** The tab a `?view=` search parameter names, or `null` when it names none. */
export function libraryViewFrom(value: string | string[] | undefined): LibraryView | null {
  return typeof value === "string" && isLibraryView(value) ? value : null;
}

// ── Remembered on this device ──────────────────────────────────────────────────────────

const KEY = "mediasafe:library-view";
const listeners = new Set<() => void>();

export function rememberedLibraryView(): LibraryView {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isLibraryView(stored) ? stored : DEFAULT_LIBRARY_VIEW;
  } catch {
    // Private windows and blocked storage throw on access. The tab is a convenience, and
    // Shows is a correct place to open.
    return DEFAULT_LIBRARY_VIEW;
  }
}

export function keepLibraryView(view: LibraryView): void {
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // Not remembered this time; the tab still changes for this visit.
  }
  for (const listener of listeners) listener();
}

export function subscribeToLibraryView(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** What the server renders, before a device's own choice is known. */
export function defaultLibraryView(): LibraryView {
  return DEFAULT_LIBRARY_VIEW;
}
