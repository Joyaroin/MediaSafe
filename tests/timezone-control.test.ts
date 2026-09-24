import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TimezoneControl } from "@/app/(signed-in)/settings/timezone-control";

/**
 * `useRouter()` throws outside a mounted Next.js app router — same fix as
 * `tests/display-name-control.test.ts`.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * The timezone control (issue #126) — Settings' Profile section, beneath the display
 * name.
 *
 * Same shape as `tests/display-name-control.test.ts`: `renderToStaticMarkup` against the
 * initial render only, since `vitest.config.mts` runs with no jsdom and there is no
 * click-and-observe here — only what the first render could get wrong. The
 * acceptance criteria this covers:
 *
 *  1. **Shows the current zone as text.**
 *  2. **One *Use this device's timezone* button** — solid, the primary affordance.
 *  3. **The full IANA list is a fallback** — collapsed on the idle render, not a second
 *     primary control sitting open beside the button.
 *  4. **Carries the one plain sentence** about re-bucketing history.
 *  5. **Never re-detects silently** — nothing about the idle render depends on
 *     `Intl.DateTimeFormat().resolvedOptions().timeZone`, which this test's Node
 *     environment answers with whatever zone the test runner happens to be in; if the
 *     component read it at render time, this suite would be flaky by construction.
 */

const render = (timezone: string) =>
  renderToStaticMarkup(createElement(TimezoneControl, { timezone }));

describe("the timezone control", () => {
  it("shows the current zone as text on the very first render", () => {
    expect(render("Europe/London")).toContain("Europe/London");
  });

  it("shows whatever zone it is handed, not a zone read from this device", () => {
    // A zone nobody's runtime reports today, chosen so the assertion cannot pass by
    // coincidentally matching the test runner's own timezone.
    expect(render("Pacific/Kiritimati")).toContain("Pacific/Kiritimati");
  });

  it("renders exactly one Use this device's timezone button, enabled at rest", () => {
    // React's static renderer HTML-escapes the apostrophe as `&#x27;`.
    const markup = render("UTC");
    const solidButtons = [...markup.matchAll(/Use this device&#x27;s timezone/g)];
    expect(solidButtons).toHaveLength(1);
    expect(markup).not.toMatch(/Use this device&#x27;s timezone[^]*?disabled=""/);
  });

  it("says what changing the zone does, in one plain sentence", () => {
    expect(render("UTC")).toContain(
      "Changing your timezone re-buckets your whole history, not just what you watch from now on.",
    );
  });

  it("does not render the full IANA list on the idle render — it is a fallback", () => {
    const markup = render("UTC");
    expect(markup).not.toContain("<select");
    expect(markup).toContain("Choose from the full list");
  });

  it("labels the disclosure as collapsed at rest", () => {
    expect(render("UTC")).toMatch(/aria-expanded="false"/);
  });
});

describe("where the timezone control appears", () => {
  it("is imported by the settings page and by nothing else", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const importers = sourceFiles(path.join(root, "app"))
      .filter((file) => /from "\.\/timezone-control"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));

    expect(importers).toEqual(["app/(signed-in)/settings/page.tsx"]);
  });

  it("renders inside Profile, after the display name control", () => {
    const page = readFileSync(
      path.resolve(import.meta.dirname, "../app/(signed-in)/settings/page.tsx"),
      "utf8",
    );

    const displayNameAt = page.indexOf("<DisplayNameControl");
    const timezoneAt = page.indexOf("<TimezoneControl");
    const dataAt = page.indexOf('id="data-h"');

    expect(displayNameAt).toBeGreaterThan(-1);
    expect(timezoneAt).toBeGreaterThan(displayNameAt);
    expect(timezoneAt).toBeLessThan(dataAt);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
