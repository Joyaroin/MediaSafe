import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
 * `errors/failure-treatment.ts`, `app/global-error.tsx` — are asserted unchanged, so a
 * regression here cannot quietly widen into an actual failure surface losing its own
 * treatment.
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

describe("the button register is ratified — the fourteen controls paint through THE_BUTTON_REGISTER", () => {
  const RECOVERY_SOURCE = source("errors/recovery-buttons.ts");

  it("declares the meaning by importing it, rather than reaching for the colour directly", () => {
    expect(RECOVERY_SOURCE).toMatch(
      /import\s*\{\s*THE_BUTTON_REGISTER\s*\}\s*from\s*"@\/app\/accent-meaning"/,
    );
  });

  it("builds the two ink treatments — GHOST_RECOVERY and its compact measure — from THE_BUTTON_REGISTER.ink", () => {
    // Two occurrences: `GHOST_RECOVERY` and `GHOST_RECOVERY_COMPACT` each reach for it once.
    const occurrences = code(RECOVERY_SOURCE).match(/THE_BUTTON_REGISTER\.ink/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("builds the two solid treatments — SOLID_RECOVERY and its compact measure — from THE_BUTTON_REGISTER.solid", () => {
    const occurrences = code(RECOVERY_SOURCE).match(/THE_BUTTON_REGISTER\.solid/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  // Issue #332 moved the four constants' durations onto the timing ramp — `duration-150`
  // became `duration-[var(--dur-fast)]` and `duration-200` became `duration-[var(--dur-base)]`
  // — so what these assert as "identical" is the treatment, not the literal that used to
  // spell it; the ramp token is the same duration by another, enforceable name.

  it("renders GHOST_RECOVERY identically to the accent outline it always drew", () => {
    expect(new Set(GHOST_RECOVERY.split(" "))).toEqual(
      new Set(
        "code-line rounded-[var(--radius-full)] border border-accent px-4 py-2 text-accent transition-colors duration-[var(--dur-fast)] hover:bg-accent hover:text-accent-ink".split(
          " ",
        ),
      ),
    );
  });

  it("renders GHOST_RECOVERY_COMPACT identically to the accent outline it always drew", () => {
    expect(new Set(GHOST_RECOVERY_COMPACT.split(" "))).toEqual(
      new Set(
        "code-line shrink-0 rounded-[var(--radius-full)] border border-accent px-2.5 py-1 text-accent transition-colors duration-[var(--dur-fast)] hover:bg-accent hover:text-accent-ink".split(
          " ",
        ),
      ),
    );
  });

  it("renders SOLID_RECOVERY identically to the solid accent it always drew", () => {
    expect(new Set(SOLID_RECOVERY.split(" "))).toEqual(
      new Set(
        "code-line rounded-[var(--radius-full)] bg-accent px-4 py-2 text-accent-ink transition-[filter] duration-[var(--dur-base)] hover:brightness-90".split(
          " ",
        ),
      ),
    );
  });

  it("renders SOLID_RECOVERY_COMPACT identically to the solid accent it always drew", () => {
    expect(new Set(SOLID_RECOVERY_COMPACT.split(" "))).toEqual(
      new Set(
        "code-line shrink-0 rounded-[var(--radius-full)] bg-accent px-2.5 py-1 text-accent-ink transition-[filter] duration-[var(--dur-base)] hover:brightness-90".split(
          " ",
        ),
      ),
    );
  });

  it("every base ink/solid literal is reached through the meaning, not typed a second way", () => {
    // The four constants' `hover:` halves are deliberately still literal (the meaning has
    // no hover-prefixed form to reach for) — that is what this leaves alone. What it holds
    // is the *base* class each constant paints at rest: outside `THE_BUTTON_REGISTER.ink`
    // and a `hover:` prefix, a bare `text-accent` would be a fifteenth control quietly
    // reintroducing the silence #310's docblock names as the whole problem.
    const stripped = code(RECOVERY_SOURCE);
    const bareInk = stripped.match(/(?<!hover:)(?<!THE_BUTTON_REGISTER\.)\btext-accent\b(?!-ink)/g) ?? [];
    expect(bareInk).toEqual([]);
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

  it("the sort caret still renders as a filled triangle, unambiguously a control", () => {
    const markup = renderToStaticMarkup(createElement(SortSelect, { value: "title" }));
    const svg = markup.match(/<svg[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? "";

    expect(svg).toContain("text-dim");
    expect(svg).toContain("<polygon");
    expect(svg).not.toContain("text-accent");
  });

  it("the timezone caret takes the same neutral ink the sort caret takes", () => {
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

  it.each(DIALOG_FILES)("%s's dialog still reads as a dialog — bordered, grounded, backdropped", (path) => {
    const tag = dialogTag(path);

    // The frame is re-coloured, not undressed: the border survives at its own weight, the
    // surface and the backdrop are untouched. Only the colour of the border changed.
    expect(tag).toMatch(/\bborder-2\b/);
    expect(tag).toMatch(/\bborder-hair\b/);
    expect(tag).toMatch(/\bbg-ground\b/);
    expect(tag).toMatch(/backdrop:bg-ground\/80/);
  });

  it("finds the five dialogs it means to check", () => {
    // A floor against the walk silently finding fewer than it should.
    expect(DIALOG_FILES.length).toBe(5);
  });
});

describe("genuine failure surfaces keep the failure treatment exactly as it is", () => {
  it("errors/write-failure-toast.tsx still frames the lost-write toast in the accent", () => {
    expect(source("errors/write-failure-toast.tsx")).toContain(
      "border-2 border-accent bg-ground p-4",
    );
    expect(source("errors/write-failure-toast.tsx")).toContain("text-bill-sm text-accent");
  });

  it("errors/offline-banner.tsx still paints the sticky banner solid accent", () => {
    const banner = source("errors/offline-banner.tsx");
    expect(banner).toMatch(/\bbg-accent\b/);
    expect(banner).toMatch(/\btext-accent-ink\b/);
  });

  it("errors/failure-treatment.ts still rules the read-failure/sign-in/sign-out treatment", () => {
    expect(source("errors/failure-treatment.ts")).toContain(
      'export const FAILURE_SECTION = "border-t-2 border-accent py-6";',
    );
    expect(source("errors/failure-treatment.ts")).toContain(
      'export const FAILURE_HEADING = "bill-title text-bill-md text-accent";',
    );
  });

  it("app/global-error.tsx still frames the root failure in the accent", () => {
    expect(source("app/global-error.tsx")).toMatch(/border-t-2 border-accent/);
  });
});
