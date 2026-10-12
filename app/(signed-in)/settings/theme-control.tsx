"use client";

import { useSyncExternalStore } from "react";

import {
  applyThemeChoice,
  readThemeChoice,
  serverThemeChoice,
  subscribeToTheme,
  type ThemeChoice,
} from "@/lib/theme";
import { SegmentedControl } from "@/app/segmented";
import { SETTING, SETTING_HELP, SETTING_LABEL } from "./settings-group";

/**
 * The theme control — Settings' Profile section, beneath the timezone.
 *
 * The *Out of scope entirely* list banned this outright until the linen
 * redesign; that bullet now carries the reversal, the three-state shape, and the reason
 * the ban stopped being defensible: the redesign recoloured the light palette only, so a
 * reader on a device set to dark had no way to reach one of the two palettes the product
 * ships without leaving the product.
 *
 * ── Three buttons, not a switch ──────────────────────────────────────────────────────
 *
 * A two-state toggle cannot express *system*, and *system* is the default and the state
 * almost every reader stays in. A switch would force everyone into an explicit answer on
 * first touch and quietly delete the "follow my device" behaviour that has been the only
 * behaviour until now. Three buttons, one pressed — the one segmented control
 * (`app/segmented.tsx`) since issue #397 — says what the states are without a legend.
 *
 * ── No toast, no rollback, no pending state ──────────────────────────────────────────
 *
 * Nothing here crosses a wire. `AGENTS.md`'s write-failure toast is for a write that was
 * lost in transit, and `lib/theme.ts` writes to `localStorage` and moves an attribute —
 * both synchronous, both local, neither losable. Adding a `Saving` label to a control
 * that finishes before the next frame would be theatre.
 *
 * ── `useSyncExternalStore`, and not `useState` + `useEffect` ─────────────────────────
 *
 * The stored choice lives in `localStorage`, which the server cannot see, so the server
 * renders *System* as pressed and the browser corrects it. Reading it during render would
 * be a hydration mismatch; correcting it with `setChoice(...)` inside an effect is the
 * cascading render React's own lint rejects, and this repo already refuses that shape once
 * (`search-surface.tsx`: *"a `useEffect` watching `query` would be React reacting to
 * itself"*). `useSyncExternalStore` is what the rule points at instead — it takes the
 * server's answer and the browser's as two declared functions rather than one patched
 * into the other.
 *
 * It also makes two tabs agree: `storage` fires in the *other* tabs of an origin, so
 * choosing Dark here moves the pressed button in a Settings tab left open elsewhere.
 *
 * **None of this is what stops the flash of the wrong palette** — `app/layout.tsx`'s
 * pre-paint script is, and it runs long before this component mounts. What can be briefly
 * wrong here is only which of three buttons looks pressed, on the one page a reader opened
 * in order to press one.
 */
const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeControl() {
  const choice = useSyncExternalStore(
    subscribeToTheme,
    readThemeChoice,
    serverThemeChoice,
  );

  // No `setState`: `applyThemeChoice` writes the storage, moves the attribute and
  // notifies the store, and the subscription above is what re-renders this. One source
  // of truth, and it is the browser's rather than React's.
  function choose(next: ThemeChoice): void {
    applyThemeChoice(next);
  }

  return (
    <div className={SETTING}>
      <span className={SETTING_LABEL}>Appearance</span>

      <p className={SETTING_HELP}>
        MediaSafe follows your device unless you tell it otherwise. This is remembered on
        this device only — signing in somewhere else starts from your system setting
        again.
      </p>

      <SegmentedControl
        label="Appearance"
        options={CHOICES}
        value={choice}
        onChange={choose}
        layoutId="theme-choice"
        onCard
        className="mt-1 w-full"
      />
    </div>
  );
}
