"use client";

/**
 * Which way a custom list is drawn — Finder's own two words, because it is Finder's own
 * distinction and inventing a third name for it would help nobody.
 *
 * `"icons"` is the default. A list is a small, hand-made set of titles a reader chose, and
 * the artwork is what tells one from another; the row view spends most of its width on
 * whitespace beside a `56px` poster.
 */
export const LIST_VIEW_MODES = ["icons", "list"] as const;
export type ListViewMode = (typeof LIST_VIEW_MODES)[number];
export const DEFAULT_LIST_VIEW_MODE: ListViewMode = "icons";

/**
 * Where the choice is kept, and why it is not in the database.
 *
 * `localStorage`, keyed once for every list rather than per list: *how I like to look at
 * my lists* is one preference, not eleven, and a reader who switches to rows on one list
 * has said something about all of them.
 *
 * ── The two homes this was not given ─────────────────────────────────────────────────
 *
 * **Not `restoration.ts`.** That is a module variable which a reload empties, deliberately
 * (#276: *session-scoped; it does not survive an app restart*). It holds *where the reader
 * was*, and a view mode is not a place — a taste that resets every time the tab is closed
 * is a taste the application keeps forgetting.
 *
 * **Not the `user` row, yet.** A durable per-account setting belongs in `lib/auth.ts` as a
 * Better Auth `additionalFields` entry, the way `user.timezone` does — and emphatically
 * **never** hand-added to `auth-schema.ts`, which `npm run auth:generate` overwrites whole
 * and whose next migration would then drop the column and the data with it (`AGENTS.md`).
 * That is the right home the day this needs to follow a reader between devices. It does
 * not today: this is a personal tracker with about three accounts, and one round trip per
 * page load to remember a toggle is a worse trade than a preference that stays on the
 * laptop it was set on.
 *
 * Every read is wrapped, because `localStorage` throws rather than returning `null` in a
 * browser set to block site data, and a view toggle is not worth a blank page. A failure
 * to read a preference is genuinely an absent preference, so this is not the
 * `no-empty-catch` rule's case: nothing here can turn a failed *read of the library* into
 * an empty one. The rule's own words — catching to manufacture a successful-looking empty
 * result out of a failure — are about data, and this is a stored answer to *how do you
 * like it*, whose honest default is the same as its honest failure mode.
 */
const KEY = "mediasafe:list-view-mode";

export function rememberedListViewMode(): ListViewMode {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isListViewMode(stored) ? stored : DEFAULT_LIST_VIEW_MODE;
  } catch {
    // Site data is blocked, or this is a context with no storage at all. There is no
    // preference to be had, which is what the default means.
    return DEFAULT_LIST_VIEW_MODE;
  }
}

export function keepListViewMode(mode: ListViewMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // As above. The toggle still works for this visit; it just will not be remembered.
  }
  for (const listener of listeners) listener();
}

/**
 * The store half, so a component can read this with `useSyncExternalStore` rather than
 * setting state in an effect.
 *
 * That is not a lint workaround, it is the right shape: the value lives outside React, in
 * a browser API the server cannot see, and `useSyncExternalStore`'s third argument exists
 * for exactly this — a **server snapshot** that differs from the client's without becoming
 * a hydration mismatch. `use-watch-mark.ts` reads `watch-marks.ts` the same way and gives
 * the same reason.
 *
 * Subscribing to `storage` is what the effect version could not do at all: the event fires
 * in a document *other* than the one that wrote, so a reader with the same list open in
 * two tabs sees the toggle they just moved take in both.
 */
const listeners = new Set<() => void>();

export function subscribeToListViewMode(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The snapshot the server renders, and the one the client falls back to. A primitive, so
 *  `useSyncExternalStore`'s identity comparison is a value comparison. */
export function defaultListViewMode(): ListViewMode {
  return DEFAULT_LIST_VIEW_MODE;
}

function isListViewMode(value: string | null): value is ListViewMode {
  return value !== null && (LIST_VIEW_MODES as readonly string[]).includes(value);
}
