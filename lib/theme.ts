/**
 * The theme choice — `SPEC.md` §7's *Out of scope entirely* list no longer bans this
 * control, and that bullet carries the reversal and its reasoning.
 *
 * ── Three states, and why the third one is not "light" ───────────────────────────────
 *
 * `system` is the default and is what a reader who never opens Settings stays in for
 * ever. It is a real state rather than the absence of one: choosing it back after
 * choosing `dark` has to *remove* the override, not write a third value that happens to
 * match today's system setting and then stops matching tonight.
 *
 * That is why `system` is stored by **deleting** the key rather than by writing the
 * string `"system"`. The stored value answers one question — *what did the reader
 * override the system with* — and "nothing" is the honest answer for two thirds of the
 * states this app will ever be in.
 *
 * ── Why `localStorage` and not `user` ────────────────────────────────────────────────
 *
 * A device preference, not an account one. `app/globals.css` already makes the argument
 * this rests on — *the phone at 11pm and the desktop in daylight are both real scenes* —
 * and a column on `user` would force one answer onto both. `user.timezone` is the
 * counter-example that proves the split rather than contradicting it: a zone is a fact
 * about the person and travels with them, and `settings/timezone-control.tsx` writes it
 * through Better Auth for exactly that reason.
 *
 * It also means **there is no write to lose**, which is why the control raises no
 * write-failure toast and has no optimistic rollback. `AGENTS.md`'s toast exists for a
 * write that crossed the wire and did not land; nothing here crosses a wire.
 */

/** The three states the control offers. `system` is the default. */
export type ThemeChoice = "system" | "light" | "dark";

/**
 * The `localStorage` key, and **the single source for it** — `app/layout.tsx` builds its
 * pre-paint script by interpolating this constant into the script string rather than
 * retyping the key inside it. A key that appears twice is a key that goes stale in one
 * of the two places, and here the failure would be silent: the script would read nothing,
 * the control would write somewhere the script never looks, and the theme would simply
 * stop persisting across reloads with no error anywhere.
 */
export const THEME_STORAGE_KEY = "mediasafe-theme";

/**
 * The attribute the palette hangs off — `:root[data-theme="dark"]` and
 * `:root:not([data-theme="light"])` in `app/globals.css`.
 */
export const THEME_ATTRIBUTE = "data-theme";

/** An override that is actually written down. `system` is the absence of one. */
export type ThemeOverride = Exclude<ThemeChoice, "system">;

export function isThemeOverride(value: unknown): value is ThemeOverride {
  return value === "light" || value === "dark";
}

/**
 * Read the stored choice. Returns `system` when nothing is stored — and also when
 * `localStorage` cannot be reached at all.
 *
 * That second case is not `AGENTS.md`'s *no `catch` returns `[]`*. The rule there forbids
 * manufacturing a successful-looking **empty result out of a failed read**, so that a
 * database being down cannot render as a library with nothing in it. This is the opposite
 * shape: `system` is not an empty answer standing in for a real one, it is the correct
 * and complete answer to *what has the reader overridden the system with* when there is
 * no storage to have overridden it in. A reader in a locked-down browsing mode gets the
 * system palette, which is precisely what they would get having never touched the
 * control, and nothing about their library is being misreported.
 */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeOverride(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Apply a choice: store it (or clear it, for `system`) and move the attribute on
 * `<html>` so the palette changes in the same frame.
 *
 * Storage is attempted first but a failure does not stop the attribute moving — the
 * theme still changes for this page, it just will not survive a reload. Silently doing
 * nothing at all would be the worse of the two.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage is unavailable — see `readThemeChoice()`. The attribute below still moves.
  }

  const root = document.documentElement;
  if (choice === "system") root.removeAttribute(THEME_ATTRIBUTE);
  else root.setAttribute(THEME_ATTRIBUTE, choice);

  for (const listener of listeners) listener();
}

/* ── The store the control subscribes to ──────────────────────────────────────────────
   `useSyncExternalStore`'s three arguments, and the reason the control uses it rather
   than the obvious `useState` + `useEffect` pair.

   The stored choice is not React state — it is `localStorage`, which the server cannot
   read, so the server has to render *System* and the browser has to correct it. Doing
   that correction with `setChoice(...)` inside an effect is the shape React's own lint
   rejects (`react-hooks/set-state-in-effect`): it is a cascading render, and
   `search-surface.tsx` already refuses the same pattern for the same reason.

   `useSyncExternalStore` is what that rule points at instead. It takes the server's
   answer and the browser's answer as two separate functions, so the mismatch is declared
   rather than patched up after the fact.

   The subscription is not ceremony either: `storage` fires in *other* tabs of the same
   origin, so choosing Dark in one tab moves the other tab's pressed button without a
   reload. `applyThemeChoice` notifies this tab directly, because `storage` deliberately
   does not fire in the tab that wrote it. */
const listeners = new Set<() => void>();

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * What the server renders. Always `system` — it has no `localStorage` to read, and
 * guessing would be a hydration mismatch rather than a better guess.
 */
export function serverThemeChoice(): ThemeChoice {
  return "system";
}
