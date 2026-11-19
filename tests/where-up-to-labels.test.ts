import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOT_STARTED,
  PICK_AN_EPISODE,
  notStartedAccessibleName,
  pickAccessibleName,
  seenAccessibleName,
  seenLabel,
} from "@/app/(signed-in)/search/where-up-to-labels";

/** Issue #550: each follow-up chip's accessible name starts with its visible label. */
describe("Search follow-up chip names", () => {
  it("says Seen it all for a show and Seen it for a film", () => {
    expect(seenLabel("show")).toBe("Seen it all");
    expect(seenLabel("film")).toBe("Seen it");
  });

  it("starts every name with the visible label and names the title", () => {
    expect(seenAccessibleName("show", "Severance")).toBe(
      "Seen it all: Severance, every aired episode",
    );
    expect(seenAccessibleName("film", "Anora")).toBe("Seen it: Anora");
    expect(notStartedAccessibleName("Severance")).toBe("Not started: Severance");
    expect(pickAccessibleName("Severance")).toBe("Pick an episode: Severance");

    expect(seenAccessibleName("show", "X").startsWith(seenLabel("show"))).toBe(true);
    expect(seenAccessibleName("film", "X").startsWith(seenLabel("film"))).toBe(true);
    expect(notStartedAccessibleName("X").startsWith(NOT_STARTED)).toBe(true);
    expect(pickAccessibleName("X").startsWith(PICK_AN_EPISODE)).toBe(true);
  });
});

describe("where the chips get their words", () => {
  it("takes every label from the shared module rather than writing it", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "..", "app/(signed-in)/search/where-up-to.tsx"),
      "utf8",
    );

    expect(source).toMatch(/from "\.\/where-up-to-labels"/);
    // Not the literals: a copy here is the drift the module exists to prevent.
    expect(source).not.toContain('"Seen it');
    expect(source).not.toContain(">Seen it");
    expect(source).not.toContain("Not started:");
  });
});
