import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PRIMARY_BUTTON,
  PRIMARY_BUTTON_COMPACT,
  SECONDARY_BUTTON,
  SECONDARY_BUTTON_COMPACT,
} from "@/app/buttons";

import { SortSelect } from "@/app/(signed-in)/library/library-filter-bar";
import {
  GHOST_RECOVERY,
  GHOST_RECOVERY_COMPACT,
  SOLID_RECOVERY,
  SOLID_RECOVERY_COMPACT,
} from "@/errors/recovery-buttons";

/** `SortSelect` calls `useRouter()`/`usePathname()`, which throw outside a mounted Next.js
 *  app router — `tests/library-surface.test.ts` hits the same wall for the same component
 *  family and stubs the same way. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/library",
}));

/**
 * Issue #311 — the migrate step #300 §12 asks for, once #310 named the three meanings and
 * #312 (not yet built) makes them a mechanical sweep.
 *
 * **Ratified.** The fourteen controls issue #195 moved onto the accent as their shared
 * register (`errors/recovery-buttons.ts`'s `GHOST_RECOVERY`, `GHOST_RECOVERY_COMPACT`,
 * `SOLID_RECOVERY`, `SOLID_RECOVERY_COMPACT`) now paint through `THE_BUTTON_REGISTER` —
 * `app/accent-meaning.ts`'s own docblock named this file as the ticket that would do it.
 *
 * **Re-narrowed.** The select carets and the accent frames on the dialogs that borrowed the
 * failure treatment (*"the same frame the write-failure toast uses, on two
 * dialogs that are neither a failure nor irreversible"*) lose the accent. Every dialog built
 * on that exact frame is re-narrowed, not only the two named — `watch-menu.tsx` and
 * `selection-action-bar.tsx`'s bulk picker share the identical class string and the identical
 * mistake.
 *
 * Genuine failure surfaces — `errors/write-failure-toast.tsx`, `errors/offline-banner.tsx`,
 * `errors/failure-treatment.ts`, `app/global-error.tsx` — are asserted by their exact
 * treatment, so a regression here cannot quietly widen into an actual failure surface
 * losing its own. Charcoal (issue #397) changed three of these on purpose: the toast is
 * framed in `danger`, the failure treatment is the outlined panel, and the dialog frame is
 * `bg-raised`.
 */

const ROOT = join(__dirname, "..");

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/** Comments blanked, the way every sweep in this repository reads source — `palette.test.ts`
 *  and `underline-audit.test.ts` both strip for the same reason: this codebase discusses the
 *  rule it keeps at length, and a raw scan finds the explanation and reports it as the breach. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " ")).replace(/\/\/.*/g, "");
}

describe("the button register is the primary button's alone — issue #357", () => {
  const BUTTONS_SOURCE = source("app/buttons.ts");
  const RECOVERY_SOURCE = source("errors/recovery-buttons.ts");

  it("paints the primary button through THE_BUTTON_REGISTER, the one place it reaches for the accent", () => {
    expect(BUTTONS_SOURCE).toMatch(
      /import\s*\{\s*THE_BUTTON_REGISTER\s*\}\s*from\s*"\.\/accent-meaning"/,
    );
    expect(code(BUTTONS_SOURCE).match(/THE_BUTTON_REGISTER\.solid/g) ?? []).toHaveLength(1);
  });

  it("maps the recovery pair onto the three variants rather than restating a style", () => {
    // The ghost pair was an accent outline every control wore; it is the neutral
    // secondary button now, and the solid pair is the primary one.
    expect(GHOST_RECOVERY).toBe(SECONDARY_BUTTON);
    expect(GHOST_RECOVERY_COMPACT).toBe(SECONDARY_BUTTON_COMPACT);
    expect(SOLID_RECOVERY).toBe(PRIMARY_BUTTON);
    expect(SOLID_RECOVERY_COMPACT).toBe(PRIMARY_BUTTON_COMPACT);
  });

  it("puts no accent on a secondary button", () => {
    expect(SECONDARY_BUTTON).not.toMatch(/accent/);
    expect(SECONDARY_BUTTON_COMPACT).not.toMatch(/accent/);
    expect(code(RECOVERY_SOURCE)).not.toMatch(/accent/);
  });
});

describe("the select carets are re-narrowed — they no longer paint the accent", () => {
  const FILTER_BAR = "app/(signed-in)/library/library-filter-bar.tsx";
  const TIMEZONE_CONTROL = "app/(signed-in)/settings/timezone-control.tsx";

  it("library-filter-bar.tsx's sort caret no longer reaches for text-accent", () => {
    expect(code(source(FILTER_BAR))).not.toMatch(/\btext-accent\b/);
  });

  it("settings/timezone-control.tsx's list caret no longer reaches for text-accent", () => {
    expect(code(source(TIMEZONE_CONTROL))).not.toMatch(/\btext-accent\b/);
  });

  /**
   * Charcoal (issue #402) redrew the sort control as a round quiet button with the up-and-
   * down arrows on it (handoff §8.4), so the filled triangle this held is gone. What it
   * held it *for* is kept: the control's ink is neutral, never the accent.
   */
  it("the sort control is a quiet round button in neutral ink, never the accent", () => {
    const markup = renderToStaticMarkup(createElement(SortSelect, { value: "title" }));

    expect(markup).toContain("quiet-fill");
    expect(markup).toContain("rounded-[var(--radius-full)]");
    expect(markup).not.toContain("accent");
  });

  it("the timezone caret takes neutral ink, as the sort caret did", () => {
    const svg = source(TIMEZONE_CONTROL).match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "";

    expect(svg).toContain("text-dim");
  });
});

describe("the dialogs that borrowed the failure frame are re-narrowed", () => {
  /**
   * Every `<dialog>` built on `border-2 border-accent bg-ground … backdrop:bg-ground/80` —
   * in as many words, *"the same frame the write-failure toast uses"*. Found from
   * the tree rather than transcribed from the ticket, which names only two by number; the
   * other three share the identical string and the identical borrowing.
   */
  const DIALOG_FILES = [
    "app/(signed-in)/lists/delete-list-dialog.tsx",
    "app/(signed-in)/library/add-to-list-control.tsx",
    "app/(signed-in)/library/mark-up-to-dialog.tsx",
    "app/(signed-in)/library/watch-menu.tsx",
    "app/(signed-in)/library/selection-action-bar.tsx",
  ] as const;

  // Comments blanked before searching: several of these files discuss `<dialog>` in prose
  // (`delete-list-dialog.tsx`'s own docblock argues for the native element by name) before
  // the real element ever appears, and a positional search would find the discussion first.
  function dialogTag(path: string): string {
    const match = code(source(path)).match(/<dialog[\s\S]*?>/);
    if (match === null) throw new Error(`${path}: no <dialog> element found`);
    return match[0];
  }

  it.each(DIALOG_FILES)("%s's dialog frame no longer paints border-accent", (path) => {
    expect(dialogTag(path)).not.toMatch(/\bborder-accent\b/);
  });

  it.each(DIALOG_FILES)("%s's dialog wears the one shared dialog frame", (path) => {
    // Issue #357: the five dialogs disagreed about their own frame. They share one now.
    expect(dialogTag(path)).toMatch(/DIALOG_FRAME/);
  });

  it("the shared frame still reads as a dialog — bordered, raised, backdropped", () => {
    const frame = source("app/buttons.ts").match(/export const DIALOG_FRAME =\s*"([^"]*)"/)?.[1];

    expect(frame).toBeDefined();
    expect(frame).toMatch(/\bborder\b/);
    expect(frame).toMatch(/\bborder-hair\b/);
    expect(frame).not.toMatch(/\bborder-accent\b/);
    // Charcoal (issue #397): a dialog is raised, so what sits inside takes its on-card form.
    expect(frame).toMatch(/\bbg-raised\b/);
    expect(frame).not.toMatch(/(^|\s)bg-ground(\s|$)/);
    expect(frame).toMatch(/backdrop:bg-ground\/80/);
    // Centred: preflight zeroes a `<dialog>`'s own `margin: auto` (issue #402).
    expect(frame).toMatch(/\bm-auto\b/);
  });

  it("finds the five dialogs it means to check", () => {
    // A floor against the walk silently finding fewer than it should.
    expect(DIALOG_FILES.length).toBe(5);
  });
});

describe("genuine failure surfaces keep their failure treatment", () => {
  it("errors/write-failure-toast.tsx frames the lost-write toast in danger, not the accent", () => {
    // Charcoal (issue #397): the accent is the text colour now, so the frame that says
    // *something you did was lost* is the `danger` line.
    const toast = code(source("errors/write-failure-toast.tsx"));
    expect(toast).toContain("bg-raised danger-line p-4");
    expect(toast).toContain("text-bill-xs font-semibold text-text");
    expect(toast).not.toMatch(/\bborder-accent\b|\btext-accent\b/);
  });

  it("errors/offline-banner.tsx still paints the sticky banner solid accent", () => {
    const banner = source("errors/offline-banner.tsx");
    expect(banner).toMatch(/\bbg-accent\b/);
    expect(banner).toMatch(/\btext-accent-ink\b/);
  });

  it("errors/failure-treatment.ts rules the read-failure/sign-in/sign-out treatment as the outlined panel", () => {
    // Charcoal (issue #397): the accent top rule and accent heading are gone. An inline
    // failure is the outlined panel with a Row heading in `text`.
    expect(source("errors/failure-treatment.ts")).toContain(
      "export const FAILURE_SECTION = OUTLINED_PANEL;",
    );
    expect(source("errors/failure-treatment.ts")).toContain(
      'export const FAILURE_HEADING = "text-row font-semibold text-text";',
    );
    expect(source("app/buttons.ts")).toContain(
      'export const OUTLINED_PANEL = "rounded-[var(--radius-6)] hair-line p-5";',
    );
  });

  it("app/global-error.tsx still frames the root failure in the accent", () => {
    expect(source("app/global-error.tsx")).toMatch(/border-t-2 border-accent/);
  });
});
