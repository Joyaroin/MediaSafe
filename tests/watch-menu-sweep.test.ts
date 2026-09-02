import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #314 — the watch menu's four controls, Cancel included, reach the 44px platform
 * minimum in both dimensions. `#300`'s problem statement measured `GHOST_RECOVERY` at
 * `34.2px` tall and `GHOST_RECOVERY_COMPACT` (Cancel) at `26.2px` — both well under the
 * minimum a reader's thumb needs, on the one dialog a reader reaches for while already
 * holding an episode.
 *
 * ── Why this is arithmetic over the class strings and not a rendered dialog ──────────
 *
 * `watch-menu.tsx`'s `useEffect(() => ref.current?.showModal())` throws in jsdom —
 * `tests/accent-migrate.test.ts`'s own docblock hits the same wall for every dialog in this
 * batch and reads source instead. This file does the same, in
 * `tests/episode-row-trailing-slot.test.ts`'s own manner: it holds the **source** to the
 * measure, converting the Tailwind utilities the menu actually ships to pixels, rather than
 * asserting anything about a render.
 *
 * ── Why `GHOST_RECOVERY`/`GHOST_RECOVERY_COMPACT` are untouched ──────────────────────
 *
 * Both are shared by a dozen-plus surfaces with no sizing complaint of their own — re-cutting
 * either would move every one of them, far outside this ticket's four controls. The
 * established way to reach 44px without doing that is composing an explicit size at the one
 * call site that needs it: `list-row.tsx`'s `` `flex h-11 shrink-0 items-center
 * ${GHOST_RECOVERY}` `` and `selection-action-bar.tsx`'s `` `${GHOST_RECOVERY_COMPACT} h-11`
 * `` /`` `${SOLID_RECOVERY_COMPACT} h-11 ${IN_FLIGHT}` `` both already do exactly this.
 * `watch-menu.tsx` now does the same, adding `min-w-11` beside `h-11` so the minimum holds in
 * both dimensions rather than only the one the problem statement measured.
 *
 * `h-11`/`min-w-11` are `2.75rem` — `44px` at the root size — the same fact
 * `episode-row-trailing-slot.test.ts` already holds `RECORDING_HIT_BOX`'s `w-11 h-11` to.
 * Tailwind's preflight sets `box-sizing: border-box`, so `h-11` fixes the rendered height at
 * exactly `44px` regardless of the padding and border `GHOST_RECOVERY`/`_COMPACT` carry, and
 * `min-w-11` is a floor under whatever the label's own content measures — deterministic
 * either way, which is why this sweep can hold the property without a browser.
 *
 * This is the sweep `#300`'s Testing Decisions ask for, "in the manner the press-register
 * sweep asserts registers" — `tests/press-spring.test.ts`'s `PRESS_CALL_SITES` — so a later
 * edit that drops `h-11`/`min-w-11` back off one of these four fails here rather than
 * shipping a control back under the minimum.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const WATCH_MENU = "app/(signed-in)/library/watch-menu.tsx";
const SOURCE = readFileSync(path.join(ROOT, WATCH_MENU), "utf8");

/** Tailwind's spacing step — `episode-row-trailing-slot.test.ts`'s own fact, restated: a
 *  spacing step is `0.25rem` and the root font size is the browser default `16px`, so
 *  `h-11` is `11 * 4 = 44`. */
const STEP_PX = 4;

/** The platform minimum this sweep exists to hold every control to — `#300`'s own number. */
const MINIMUM_PX = 44;

/** The four controls, in the order the menu presents them — `WatchMenu`'s own reading order. */
const CONTROLS = ["Rewatch", "Undo", "Unwatch", "Cancel"] as const;

/**
 * The `className={...}` expression immediately guarding one `<button>...Label</button>`,
 * read as raw source text — deliberately not evaluated, because every check below is a
 * token search over literal Tailwind utilities (`h-11`, `min-w-11`) that never sit inside
 * `${GHOST_RECOVERY}`'s own interpolation, `episode-row-trailing-slot.test.ts`'s own reason
 * for leaving an interpolation unresolved: none of what this file looks for lives there.
 */
function classesFor(label: string): string {
  const labelMatch = new RegExp(`>\\s*\\n\\s*${label}\\s*\\n`).exec(SOURCE);
  if (labelMatch === null) throw new Error(`no <button>…${label}</button> found in ${WATCH_MENU}`);

  const tagStart = SOURCE.lastIndexOf("<button", labelMatch.index);
  if (tagStart < 0) throw new Error(`${label}'s </button> has no opening <button before it`);

  const tag = SOURCE.slice(tagStart, labelMatch.index + 1);
  const match = tag.match(/className=\{`([^`]*)`\}/);
  if (match === null) {
    throw new Error(`${label}'s <button> does not carry a template-literal className`);
  }

  return match[1];
}

/** The pixel value of a Tailwind spacing utility — `h-11` → `44`, `min-w-11` → `44`. Returns
 *  `null` when the class string never spells the utility at all. */
function stepValue(classes: string, prefix: string): number | null {
  const match = new RegExp(`(?:^| )${prefix}-(\\d+(?:\\.\\d+)?)(?: |$)`).exec(` ${classes} `);
  return match === null ? null : Number(match[1]) * STEP_PX;
}

describe("the watch menu's four controls reach the platform minimum", () => {
  it("finds all four controls, and no others, in the menu's own reading order", () => {
    for (const label of CONTROLS) expect(() => classesFor(label)).not.toThrow();
  });

  it.each(CONTROLS)("%s's height is fixed at exactly the 44px minimum", (label) => {
    const height = stepValue(classesFor(label), "h");
    expect(height, `${label} must declare h-11`).toBe(MINIMUM_PX);
  });

  it.each(CONTROLS)("%s's width is floored at the 44px minimum", (label) => {
    const width = stepValue(classesFor(label), "min-w");
    expect(width, `${label} must declare min-w-11`).toBe(MINIMUM_PX);
    expect(width).toBeGreaterThanOrEqual(MINIMUM_PX);
  });

  it("keeps Cancel on GHOST_RECOVERY_COMPACT, and the other three on GHOST_RECOVERY", () => {
    // Not merely sized — still the same register `#311` already declared them onto
    // (`THE_BUTTON_REGISTER`, by way of `errors/recovery-buttons.ts`), so this sweep cannot
    // pass by way of a control that stopped being one of the fourteen.
    for (const label of ["Rewatch", "Undo", "Unwatch"] as const) {
      expect(classesFor(label)).toMatch(/\bGHOST_RECOVERY\b(?!_COMPACT)/);
    }
    expect(classesFor("Cancel")).toMatch(/\bGHOST_RECOVERY_COMPACT\b/);
  });
});
