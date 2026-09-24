import {
  PRIMARY_BUTTON,
  PRIMARY_BUTTON_COMPACT,
  SECONDARY_BUTTON,
  SECONDARY_BUTTON_COMPACT,
} from "@/app/buttons";

export { DISABLED_DIM, IN_FLIGHT, NOT_YET_ARMED } from "@/app/button-states";

/**
 * The recovery controls — *Try again*, *Open your library*, *Back* — and every other
 * control that borrowed these names.
 *
 * Until issue #357 the ghost pair was an accent outline, and it was the app's one button:
 * Remove, Cancel, Undo, Back and Add to list all wore it, so nothing told the eye which one
 * mattered. The names stay, because thirty-odd call sites and the error surfaces use them,
 * but they are the three-variant system's now (`app/buttons.ts`):
 *
 * - **`GHOST_RECOVERY`** is a **secondary** button — neutral, reachable, never loud.
 * - **`SOLID_RECOVERY`** is the **primary** button — the one main action on a surface, the
 *   only one of the two that wears the accent.
 *
 * Each has a compact measure for rows and toolbars.
 */
export const GHOST_RECOVERY = SECONDARY_BUTTON;

export const GHOST_RECOVERY_COMPACT = SECONDARY_BUTTON_COMPACT;

export const SOLID_RECOVERY = PRIMARY_BUTTON;

export const SOLID_RECOVERY_COMPACT = PRIMARY_BUTTON_COMPACT;
