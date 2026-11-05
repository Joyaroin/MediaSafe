import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Issue #443 — after *Add*, the search row's pills give way to *In your library* through
 * `Roll` (`app/roll.tsx`), instead of the confirmation teleporting into the pills' place.
 *
 * `catalogue-result.tsx` reaches a Server Action through `use-catalogue-add.ts` (`actions.ts`
 * is `"use server"`) and does not render under Vitest — `tests/unowned-title-surface.test.ts`
 * names the same boundary for the shape beside it. So, as `search-results-motion.test.ts` and
 * `search-clear.test.ts` already do for this screen, this reads the source as text rather than
 * rendering it.
 *
 * The add itself is unchanged — still optimistic, still the one caller of the write-failure
 * toast (`tests/lost-add.test.ts` holds that rule) — so nothing here touches `attempt`,
 * `inLibrary`'s rollback, or the toast. What changed is only how the row *shows* the two
 * states.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const ROW = code("app/(signed-in)/search/catalogue-result.tsx");
const HOOK = code("app/(signed-in)/search/use-catalogue-add.ts");

describe("the row's pills give way to In your library through Roll", () => {
  it("imports the shared Roll rather than a new one", () => {
    expect(ROW).toMatch(/import \{ ?Roll ?\} from "@\/app\/roll"/);
    // Reused, not reinvented — no second line-roll component anywhere in this file.
    expect(ROW).not.toMatch(/@utility|@keyframes|function Roll\(/);
  });

  it("rolls the primary pill into the confirmation, keyed off inLibrary", () => {
    // One Roll around the toggle between the Add pill and the *In your library* link —
    // the two must share one grid cell for the leaving copy to lift as the new one rises.
    const primary = ROW.match(/<Roll\s+rollKey=\{inLibrary \? "[^"]+" : "[^"]+"\}[^>]*>[\s\S]*?<\/Roll>/g) ?? [];
    expect(primary.length).toBeGreaterThanOrEqual(1);

    const trailing = primary.find((block) => block.includes("In your library"));
    expect(trailing).toBeDefined();
    expect(trailing).toContain("CheckmarkIcon");
    expect(trailing).toMatch(/onClick=\{\(\) => void attempt\(false\)\}/);
    expect(trailing).toContain("<span className={PRIMARY_PILL}>Add</span>");
  });

  it("rolls the second add's pill away the same way, not by cutting it", () => {
    const secondary = ROW.match(
      /<Roll\s+rollKey=\{inLibrary \? "[^"]+" : "[^"]+"\}[^>]*>[\s\S]*?<\/Roll>/g,
    )!.find((block) => block.includes("attempt(true)"));

    expect(secondary).toBeDefined();
    expect(secondary).toMatch(/onClick=\{\(\) => void attempt\(true\)\}/);
    expect(secondary).toMatch(
      /<span className=\{SECONDARY_PILL\}>\s*\{addWatchedLabel\(result\.kind\)\}\s*<\/span>/,
    );
  });

  it("keys every roll off the one optimistic flag, not a second piece of state", () => {
    const keys = [...ROW.matchAll(/<Roll\s+rollKey=\{([^}]+)\}/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const key of keys) {
      expect(key).toMatch(/^inLibrary \? "[^"]+" : "[^"]+"$/);
    }
  });

  it("leaves the optimistic write, its rollback and the toast's one caller untouched", () => {
    // `attempt`, `inLibrary` and the hook's own shape are this ticket's unchanged half.
    expect(HOOK).toContain("const [inLibrary, setInLibrary] = useState(result.inLibrary);");
    expect(HOOK).toContain("setInLibrary(true);");
    expect(HOOK).toContain("setInLibrary(false);");
    expect(HOOK).toContain("raiseLostAdd(raised.current,");
    // No new timer anywhere near the toast — AGENTS.md's "do not add a timer".
    expect(HOOK).not.toMatch(/setTimeout|setInterval/);
  });

  it("declares no new duration, easing or component to do it", () => {
    expect(ROW).not.toMatch(/\d+m?s\b/);
    expect(ROW).not.toMatch(/@utility|@keyframes/);
    expect(HOOK).not.toMatch(/\d+m?s\b/);
  });
});
