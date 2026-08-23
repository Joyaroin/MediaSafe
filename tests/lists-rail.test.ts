import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListsRail } from "@/app/(signed-in)/library/lists-rail";
import type { ListSummary } from "@/db/access";

/**
 * Lists join the Library on the phone — issue #223. `ListsRail` is the rail itself; the
 * fact that `LibraryColumn` hides it during selection lives in `library-surface.tsx`,
 * which cannot be rendered here (`tests/library-surface.test.ts`'s own note: it reaches
 * `programme-note.tsx` → `title-detail-actions.ts` → `server-only`), so that half is
 * checked by reading the source, the same device `tests/phone-groups-scroll.test.ts` uses
 * for a surface one level up from anything this harness can mount.
 */

function list(overrides: Partial<ListSummary> = {}): ListSummary {
  return { id: "list-1", name: "Films to watch with Mum", titleCount: 14, ...overrides };
}

const rail = (lists: readonly ListSummary[]) =>
  renderToStaticMarkup(createElement(ListsRail, { lists }));

describe("the Lists rail", () => {
  it("is absent — no heading, no reserved space — when there are no lists", () => {
    expect(rail([])).toBe("");
  });

  it("renders every list, uncapped", () => {
    const markup = rail([list({ id: "a", name: "Films" }), list({ id: "b", name: "Shows" })]);

    expect(markup).toContain("Films");
    expect(markup).toContain("Shows");
    expect(markup).not.toMatch(/\.slice\(/);
  });

  it("carries no count, per the design rule", () => {
    // A number unlikely to collide with any class the card carries (`h-14`, `w-36` …).
    const markup = rail([list({ titleCount: 727 })]);

    expect(markup).not.toContain("727");
    expect(markup).not.toContain("Title");
  });

  it("opens that list's own screen, and nothing else", () => {
    const markup = rail([list({ id: "xyz" })]);

    expect(markup).toContain('href="/lists/xyz"');
  });

  it("truncates the name to one line rather than wrapping it", () => {
    const markup = rail([list()]);

    expect(markup).toContain("truncate");
  });

  it("is a plain link, carrying no hold gesture or selection attribute", () => {
    const markup = rail([list()]);

    expect(markup).not.toContain("data-holding");
    expect(markup).not.toContain("data-landed");
    expect(markup).not.toContain("aria-pressed");
    expect(markup).not.toContain("<button");
  });

  it("snaps from both halves of the rule, aligned to the page gutter", () => {
    const markup = rail([list()]);
    const track = markup.match(/<ol class="([^"]*)"/)?.[1];

    expect(track).toBeDefined();
    expect(track).toContain("snap-x");
    expect(track).toContain("snap-mandatory");
    expect(track).toContain("scroll-pl-[22px]");
    expect(track).toContain("px-[22px]");
    expect(markup).toContain("snap-start");
  });

  it("hides its own scrollbar, the same way every other track in this app does", () => {
    const markup = rail([list()]);

    expect(markup).toMatch(/scrollbar-width/);
    expect(markup).toMatch(/webkit-scrollbar/);
  });

  it("is phone-only", () => {
    const markup = rail([list()]);

    expect(markup).toMatch(/lg:hidden/);
  });
});

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const LISTS_RAIL = "app/(signed-in)/library/lists-rail.tsx";
const LIBRARY_SURFACE = "app/(signed-in)/library/library-surface.tsx";

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

/**
 * The source's own prose names the hooks and the directive it deliberately does *not*
 * use — the same reasoning `home-group.tsx` gives for no arrows — so these strip comments
 * first, the device `tests/phone-groups-scroll.test.ts` uses for the identical problem.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

describe("the rail carries no hold gesture and no arrows, by source", () => {
  const source = code(sourceAt(LISTS_RAIL));

  it("stays a server component — nothing here needs client state", () => {
    expect(source).not.toMatch(/"use client"/);
  });

  it("imports no selection or hold-to-select machinery", () => {
    expect(source).not.toMatch(/useBulkSelection|useHoldToSelect|useIsSelected/);
  });

  it("grows no scroll arrows", () => {
    expect(source).not.toMatch(/scrollBy/);
    expect(source).not.toMatch(/aria-label="Scroll/);
  });
});

describe("the Lists rail hides during selection, with the filter bar", () => {
  const source = sourceAt(LIBRARY_SURFACE);

  it("gates ListsRail on the same selecting flag that hides the chips and the field", () => {
    expect(source).toMatch(/selecting \? null : <ListsRail lists={lists} \/>/);
  });
});
