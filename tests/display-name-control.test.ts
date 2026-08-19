import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DisplayNameControl } from "@/app/(signed-in)/settings/display-name-control";

/**
 * `useRouter()` throws outside a mounted Next.js app router — same problem, same fix as
 * `tests/library-surface.test.ts`. Stubbed to the one method a successful save calls.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * The display name control (issue #123) — Settings' Profile section, and the one place
 * `user.name` is written from.
 *
 * Same shape as `tests/rating-control.test.ts`: `renderToStaticMarkup` against the initial
 * render only, because `vitest.config.ts` runs with `environment: "node"` and no jsdom, so
 * there is no click-and-observe here — only what the first render could get wrong.
 * `SPEC.md` §7's acceptance criteria this covers:
 *
 *  1. **Capped at 24, refusing rather than truncating** — the native `maxlength`.
 *  2. **The limit is apparent before saving** — the counter renders on load, not only
 *     after a rejected keystroke.
 *  3. **Empty is not a state** — *Save* starts disabled, and stays disabled on an
 *     unchanged field, so there is no render where a no-op or an empty name is one press
 *     away from a write.
 */

const render = (name: string) =>
  renderToStaticMarkup(createElement(DisplayNameControl, { name }));

describe("the display name control", () => {
  it("shows the current name in the field", () => {
    expect(render("Adham")).toMatch(/<input[^>]*value="Adham"/);
  });

  it("caps the field at 24 characters, so the input refuses rather than truncates", () => {
    expect(render("Adham")).toMatch(/<input[^>]*maxLength="24"/);
  });

  it("shows the character count against the cap on the very first render", () => {
    expect(render("Adham")).toContain("5 / 24");
  });

  it("counts a 24-character name as full, not over", () => {
    const full = "A".repeat(24);
    expect(render(full)).toContain("24 / 24");
  });

  it("disables Save until the field actually changes from what was saved", () => {
    const markup = render("Adham");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>\s*Save\s*<\/button>/);
  });

  it("labels the field Display name, tying the label to the input by id", () => {
    const markup = render("Adham");
    expect(markup).toContain('for="display-name"');
    expect(markup).toContain('id="display-name"');
    expect(markup).toContain("Display name");
  });

  it("is a plain text field, not type=search — there is no clear button in this world", () => {
    expect(render("Adham")).toMatch(/<input[^>]*type="text"/);
  });
});

describe("where the display name control appears", () => {
  it("is imported by the settings page and by nothing else", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const importers = sourceFiles(path.join(root, "app"))
      .filter((file) =>
        /from "\.\/display-name-control"/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(root, file));

    expect(importers).toEqual(["app/(signed-in)/settings/page.tsx"]);
  });

  it("renders inside a Profile section that comes before Data and Account", () => {
    const page = readFileSync(
      path.resolve(import.meta.dirname, "../app/(signed-in)/settings/page.tsx"),
      "utf8",
    );

    const profileAt = page.indexOf('id="profile-h"');
    const dataAt = page.indexOf('id="data-h"');
    const accountAt = page.indexOf('id="account-h"');

    expect(profileAt).toBeGreaterThan(-1);
    expect(profileAt).toBeLessThan(dataAt);
    expect(dataAt).toBeLessThan(accountAt);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
