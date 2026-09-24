import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

import { SignOutOtherDevicesButton } from "@/app/(signed-in)/settings/sign-out-other-devices-button";

/**
 * Sign out other devices (issue #124) — a control that must say what it will do and, on
 * its idle render, must not yet claim to have done it.
 *
 * `vitest.config.mts` runs in a Node environment with no jsdom, so — matching
 * `tests/display-name-control.test.ts`, the surviving precedent for a client control that
 * writes through Better Auth or a server action — this checks the markup a first render
 * produces rather than simulating a press. What a press does is `authClient` talking to
 * Better Auth's own endpoint, which is exactly the boundary this repository does not mock
 * (`vitest.config.mts`'s own docblock: *a mock of a unique constraint tests the mock*).
 */

const markup = () => renderToStaticMarkup(createElement(SignOutOtherDevicesButton));

describe("the sign-out-other-devices control", () => {
  it("labels itself by what it does, never 'everywhere' or 'all devices'", () => {
    const rendered = markup();

    expect(rendered).toContain("Sign out other devices");
    expect(rendered).not.toMatch(/sign out everywhere/i);
    expect(rendered).not.toMatch(/all devices/i);
  });

  it("says nothing succeeded before a press has happened", () => {
    // `succeeded` starts false — the idle render carries no confirmation and no count.
    expect(markup()).not.toMatch(/signed out\./i);
  });

  it("names no session — no count, no device, no location, no last-used time", () => {
    const rendered = markup();

    expect(rendered).not.toMatch(/\d+\s+session/i);
    expect(rendered).not.toMatch(/device \d|last used|logged in from/i);
  });

  it("renders one ghost-treatment button, not a link and not disabled at rest", () => {
    const rendered = markup();

    expect([...rendered.matchAll(/<button/g)]).toHaveLength(1);
    // The boolean attribute, not the `disabled:` Tailwind variant inside `class="..."`.
    expect(rendered).not.toMatch(/ disabled=""/);
    // Issue #357: a secondary button — neutral, never the accent the one primary action wears.
    expect(rendered).toContain(GHOST_RECOVERY);
    expect(rendered).not.toContain("bg-accent");
  });
});

describe("where the control appears", () => {
  it("is wired into the Account section of Settings, beside Sign out", () => {
    const page = readFileSync(
      path.resolve(import.meta.dirname, "../app/(signed-in)/settings/page.tsx"),
      "utf8",
    );

    expect(page).toContain("<SignOutButton />");
    expect(page).toContain("<SignOutOtherDevicesButton />");
  });
});
