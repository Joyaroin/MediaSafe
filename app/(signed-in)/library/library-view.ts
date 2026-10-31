/**
 * Library's three tabs — issue #357: Shows, Films and Lists. Lists used to be a destination
 * of its own that a phone could not reach until a list already existed; it is a tab here
 * now, so everything a reader keeps is in one place.
 *
 * The chosen tab is remembered per reader, on this device, the way the theme override and
 * a list's view are — it used to reset to Shows on every visit. A link can still name a
 * tab (`/library?view=lists`), which is where a list's back control leads.
 *
 * Not `"use client"`: the parse, the list and the precedence are pure and read on the
 * server too. The remembered half touches `window`, `document` and `location` only inside
 * functions a client calls.
 *
 * ── Why also a cookie (issue #453) ───────────────────────────────────────────────────
 *
 * `localStorage` alone means the server always renders Shows: it cannot read a device
 * store, so a cold load (a reload, a phone home screen) painted Shows first and then
 * switched under the reader once the client corrected it. `keepLibraryView` now writes a
 * cookie alongside `localStorage` — the same fact, in the one device store a server
 * request actually carries — so `LibraryPage` can resolve the real tab before it ever
 * renders. `localStorage` keeps working exactly as it did; the cookie is a mirror, not a
 * replacement, for the same reason the storage write below does not stop for a thrown
 * cookie store: a write that does not land simply leaves the tab unremembered for next
 * time, and the tab still changes for this visit.
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

/**
 * The cookie's name — the server-readable mirror of the `localStorage` key below. Kept
 * distinct from it (hyphenated, no colon) because a cookie name is far more constrained
 * than a storage key, and because the two stores are read by different code (this one by
 * `LibraryPage`, a Server Component; the other only ever by a client).
 */
export const LIBRARY_VIEW_COOKIE = "mediasafe-library-view";

/**
 * A year — long enough that the tab outlives the gap between visits this exists for,
 * short enough that it is not read as "forever" if a device is ever audited for what it
 * keeps.
 */
const LIBRARY_VIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The tab the cookie names, or `null` when it is missing or names none of the three. */
export function libraryViewFromCookie(value: string | undefined): LibraryView | null {
  return typeof value === "string" && isLibraryView(value) ? value : null;
}

/**
 * The server's precedence, in one place rather than re-derived at each call site:
 * `?view=` wins when it names a tab, then the cookie, then the default. A reader with a
 * shared or deep link lands where it points even when this device remembers something
 * else — the cookie and the `localStorage` it mirrors are a convenience, never a lock-in.
 */
export function resolveLibraryView(
  viewParam: string | string[] | undefined,
  cookieValue: string | undefined,
): LibraryView {
  return libraryViewFrom(viewParam) ?? libraryViewFromCookie(cookieValue) ?? DEFAULT_LIBRARY_VIEW;
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
  try {
    const attributes = [
      `${LIBRARY_VIEW_COOKIE}=${view}`,
      "Path=/",
      `Max-Age=${LIBRARY_VIEW_COOKIE_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
    ];
    // Only where the browser will accept it — see `lib/timezone.ts`'s own cookie write
    // for why an unconditional `Secure` would drop this in local development.
    if (location.protocol === "https:") attributes.push("Secure");
    document.cookie = attributes.join("; ");
  } catch {
    // Same as above — a blocked cookie store still lets the tab change for this visit.
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
