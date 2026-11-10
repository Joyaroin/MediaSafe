import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Issue #477 — Search's add confirmation rolls in.
 *
 * `tests/e2e/search-add-roll.spec.ts` plays the moment in a browser: the pills roll out,
 * *In your library* rolls in, the row's height never moves, and a lost write brings the
 * pills back. What a static read can hold this file to, the way `search-results-motion
 * .test.ts` holds Search's stagger: the row reuses `Roll` — the vocabulary this spec
 * forbids reinventing — through exactly **one** slot rather than two independent ones
 * (the ticket's own wording: *the Add and I've seen it pills give way to In your library
 * through a `Roll`*, singular), and the space the second pill leaves is never collapsed
 * out from under the row once it is reserved.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const ROW_PATH = "app/(signed-in)/search/catalogue-result.tsx";
const ROW = code(ROW_PATH);
const HOOK = readFileSync("app/(signed-in)/search/use-catalogue-add.ts", "utf8");

describe("the add confirmation reuses Roll through one slot (issue #477)", () => {
  it("imports Roll from the shared component, not a reimplementation", () => {
    expect(ROW).toMatch(/import\s*\{\s*Roll\s*\}\s*from\s*"@\/app\/roll"/);
  });

  it("renders exactly one Roll — a single slot the two pills give way through", () => {
    const openTags = ROW.match(/<Roll\b/g) ?? [];
    expect(openTags).toHaveLength(1);
  });

  it("keys that one Roll on whether the title is in the library", () => {
    const rollTag = ROW.match(/<Roll[^>]*>/)?.[0] ?? "";
    expect(rollTag).toMatch(/rollKey=\{inLibrary/);
  });

  it("reserves the second pill's slot whether or not the pill is there, so nothing collapses once it leaves", () => {
    // The slot itself is a fixed 44px, a `const` rather than a literal repeated at each
    // call site.
    const slotDeclaration = ROW.match(/const\s+(\w+)\s*=\s*"[^"]*\bh-11\b[^"]*"/);
    expect(slotDeclaration).not.toBeNull();
    const slotName = slotDeclaration![1];

    // The wrapper that uses it is unconditional; the ternary deciding whether the pill
    // renders inside it lives *inside* the wrapper, not around it — the bug the rejected
    // build shipped, where the whole wrapper vanished with the pill.
    const wrapperUse = new RegExp(`<div className=\\{${slotName}\\}>\\s*\\{inLibrary \\? null`);
    expect(ROW).toMatch(wrapperUse);
  });

  it("still says In your library through the same link, unchanged", () => {
    expect(ROW).toMatch(/is in your library — open it/);
    expect(ROW).toContain("In your library");
  });

  it("introduces no new keyframe or utility — the motion is Roll's, reused whole", () => {
    expect(ROW).not.toMatch(/@utility|@keyframes/);
  });

  it("keeps a lost add's rollback intact, so the pills are what comes back", () => {
    // `useCatalogueAdd` is this ticket's only other expected touch, and the property the
    // roll depends on is already its job: a failed write clears the optimistic flag,
    // which is the one thing that drives `Roll`'s key back to "the pills".
    expect(HOOK).toContain("setInLibrary(false)");
    expect(HOOK).toContain("raiseLostAdd");
  });
});
