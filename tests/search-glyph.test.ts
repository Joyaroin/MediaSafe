import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One magnifying glass for Search — issue #548.
 *
 * The tab (sidebar and tab bar) and the search field must draw the same glyph. Nothing
 * else fails when the field grows its own `<svg>` again: both would still render a
 * magnifier, just two that quietly stop agreeing. So this reads the sources.
 */
function sourceAt(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("the search field's glyph", () => {
  const field = sourceAt("app/(signed-in)/search/search-surface.tsx");

  it("is the Search tab's SearchIcon", () => {
    expect(field).toMatch(/import \{[^}]*\bSearchIcon\b[^}]*\} from "@\/app\/nav-icons"/);
    expect(field).toContain("<SearchIcon");
  });

  it("is not drawn a second time inline", () => {
    // The clear button's cross is a legitimate `<svg>` of its own, so the magnifier is
    // recognised by what makes it one: the ring, and the field's old stroke width.
    expect(field).not.toContain("<circle");
    expect(field).not.toContain('strokeWidth="1.8"');
  });
});

describe("SearchIcon", () => {
  const icons = sourceAt("app/nav-icons.tsx");
  const body = icons.slice(icons.indexOf("export function SearchIcon"));
  const glyph = body.slice(0, body.indexOf("\n}\n"));

  it("is a stroked ring and handle at the field's stroke width", () => {
    expect(glyph).toContain("<circle");
    expect(glyph).toContain('strokeWidth="1.8"');
  });

  it("is the glyph both navigations draw for /search", () => {
    expect(icons).toMatch(/"\/search": SearchIcon/);
  });
});
