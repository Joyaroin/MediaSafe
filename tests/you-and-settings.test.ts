import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CalendarFeedControl } from "@/app/(signed-in)/settings/calendar-feed-control";
import { DisplayNameControl } from "@/app/(signed-in)/settings/display-name-control";
import { SHADES } from "@/app/(signed-in)/you/year-heatmap";
import { YouHeading } from "@/app/(signed-in)/you/you-heading";
import { YouHero } from "@/app/(signed-in)/you/you-hero";
import { NOT_YET_ARMED } from "@/app/button-states";
import { PRIMARY_BUTTON, PRIMARY_BUTTON_COMPACT, PRIMARY_BUTTON_LARGE } from "@/app/buttons";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
  usePathname: () => "/settings",
}));

/**
 * Issue #405 — Charcoal 11, You and Settings redrawn (handoff §8.8, §8.9). One suite for
 * the slice's four acceptance criteria that a first render can show; how the name
 * truncates on a real phone is a layout fact, checked in a browser as well as here.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

function filesUnder(relative: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, relative));
  return files;
}

/** Comments blanked, so prose that names a constant is not mistaken for a use of it. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*/g, " ");
}

describe("the heatmap's ramp", () => {
  it("is five steps from hair to text, the middle three mixed in oklab at 25, 50 and 75%", () => {
    expect(SHADES).toEqual([
      "bg-hair",
      "bg-[color-mix(in_oklab,var(--color-text)_25%,var(--color-hair))]",
      "bg-[color-mix(in_oklab,var(--color-text)_50%,var(--color-hair))]",
      "bg-[color-mix(in_oklab,var(--color-text)_75%,var(--color-hair))]",
      "bg-text",
    ]);
  });

  it("reads no colour but the two existing tokens", () => {
    const named = SHADES.join(" ").match(/--color-[a-z-]+/g) ?? [];
    expect(new Set(named)).toEqual(new Set(["--color-text", "--color-hair"]));
  });
});

describe("Settings has no filled button", () => {
  const files = filesUnder("app/(signed-in)/settings");

  it("sweeps the whole route, delete-account included", () => {
    expect(files.some((file) => file.endsWith("settings/page.tsx"))).toBe(true);
    expect(files.some((file) => file.endsWith("delete-account-form.tsx"))).toBe(true);
  });

  it("names no filled treatment anywhere in it", () => {
    for (const file of files) {
      expect(code(file), path.relative(ROOT, file)).not.toMatch(
        /\b(SOLID_RECOVERY(_COMPACT)?|PRIMARY_BUTTON(_COMPACT|_LARGE)?|PRIMARY_PILL|bg-accent)\b/,
      );
    }
  });

  it("renders Save quiet, and not armed until the name changes", () => {
    const markup = renderToStaticMarkup(createElement(DisplayNameControl, { name: "Adham" }));

    expect(markup).not.toContain(PRIMARY_BUTTON);
    const save = markup.match(/<button[^>]*>\s*Save\s*<\/button>/)?.[0] ?? "";
    expect(save).toContain('disabled=""');
    expect(save).toContain(NOT_YET_ARMED);
  });

  it("renders the calendar link's controls quiet and plain, never filled", () => {
    for (const url of [null, PLACEHOLDER_FEED]) {
      const markup = renderToStaticMarkup(createElement(CalendarFeedControl, { url }));
      for (const filled of [PRIMARY_BUTTON, PRIMARY_BUTTON_COMPACT, PRIMARY_BUTTON_LARGE]) {
        expect(markup).not.toContain(filled);
      }
    }
  });
});

/**
 * **Not a real token.** The calendar link is a private token (handoff §8.9); this suite
 * renders the control with the board's own placeholder, and nothing in `tests/` may hold
 * a real one.
 */
const PLACEHOLDER_FEED = "https://mediasafe.example/api/calendar/[your link]";

describe("no real calendar token appears in a test", () => {
  it("prints the placeholder it was handed, and nothing else", () => {
    const markup = renderToStaticMarkup(
      createElement(CalendarFeedControl, { url: PLACEHOLDER_FEED }),
    );
    expect(markup).toContain(PLACEHOLDER_FEED);
  });

  it("holds no feed URL with a token-shaped path anywhere under tests/", () => {
    // A feed token is long and random; a URL path segment under `/api/calendar/` of 20 or
    // more URL-safe characters is what one would look like pasted into a fixture.
    for (const file of filesUnder("tests")) {
      expect(readFileSync(file, "utf8"), path.relative(ROOT, file)).not.toMatch(
        /\/api\/calendar\/[A-Za-z0-9_-]{20,}/,
      );
    }
  });
});

describe("a 24-character display name", () => {
  const NAME = "Bartholomew Featherstone"; // 24 characters, the cap
  const markup = renderToStaticMarkup(
    createElement(
      YouHeading,
      null,
      createElement(YouHero, { displayName: NAME, avatarUrl: null }),
    ),
  );

  it("is the cap, so this is the longest name the field accepts", () => {
    expect(NAME).toHaveLength(24);
  });

  it("is the page's one h1, on one line, and gives way rather than pushing", () => {
    const h1 = markup.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) ?? [];
    expect(h1).toHaveLength(1);
    expect(h1[0]).toContain(NAME);
    expect(h1[0]).toMatch(/<h1[^>]*class="[^"]*\bmin-w-0\b[^"]*\bflex-1\b/);
    // On the span, never the `h1`: `screen-title`'s `text-wrap: balance` resets the wrap
    // mode `truncate` sets when both are on one element, and the name wraps to two lines.
    expect(h1[0]).not.toMatch(/<h1[^>]*\btruncate\b/);
    expect(h1[0]).toMatch(/<span class="[^"]*\btruncate\b[^"]*">Bartholomew Featherstone<\/span>/);
  });

  it("keeps the settings button from shrinking, after the name", () => {
    const link = markup.match(/<a[^>]*href="\/settings"[^>]*>/)?.[0] ?? "";
    expect(link).toContain('aria-label="Settings"');
    expect(link).toMatch(/\bshrink-0\b/);
    expect(markup.indexOf(NAME)).toBeLessThan(markup.indexOf('href="/settings"'));
  });
});
