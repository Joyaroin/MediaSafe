import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Handoff §5.2: at most one filled button per surface — a screen, a dialog, a sheet or a
 * toast — and Search's per-row *Add* is the one exception, each the main action of its own
 * row. A per-row filled control is the shape that breaks the limit by multiplying, so it is
 * the one this holds by hand: the filled pill is Search's and nobody else's (issue #409).
 */
describe("the filled pill is Search's per-row Add and nothing else", () => {
  const users = walk("app")
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(path.join("app", "buttons.ts")))
    .filter((file) => /\bPRIMARY_PILL\b/.test(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));

  it("is used only by the search result row", () => {
    expect(users).toEqual([path.join("app", "(signed-in)", "search", "catalogue-result.tsx")]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
