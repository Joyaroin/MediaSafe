import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { episodeNameFrom, PLACEHOLDER_NAME } from "@/tmdb/mirror";

/**
 * TMDB's `Episode N` is not a name (`CONTEXT.md`, *Placeholder name*). Two places enforce
 * that — the mirror for what arrives, `drizzle/0011` for what had already arrived — and
 * they must agree on what a placeholder is.
 */
describe("episodeNameFrom", () => {
  it("treats TMDB's placeholder as no name", () => {
    expect(episodeNameFrom("Episode 4")).toBeNull();
    expect(episodeNameFrom("Episode 112")).toBeNull();
  });

  it("keeps a real name, including one that merely starts like a placeholder", () => {
    expect(episodeNameFrom("The Target")).toBe("The Target");
    expect(episodeNameFrom("Episode 4: The Return")).toBe("Episode 4: The Return");
    expect(episodeNameFrom("Episode IV")).toBe("Episode IV");
  });

  it("still reads empty and missing as no name", () => {
    expect(episodeNameFrom("")).toBeNull();
    expect(episodeNameFrom(null)).toBeNull();
    expect(episodeNameFrom(undefined)).toBeNull();
  });
});

describe("drizzle/0011 clears exactly what the mirror refuses", () => {
  const sql = readFileSync(
    path.join(import.meta.dirname, "../drizzle/0011_episode-placeholder-names.sql"),
    "utf8",
  );
  const pattern = /"name" ~ '([^']+)'/.exec(sql)?.[1];

  it("has one pattern, and it is the mirror's", () => {
    expect(pattern).toBeDefined();
    const migration = new RegExp(pattern!);
    for (const name of ["Episode 4", "Episode 112", "Episode 4: The Return", "Pilot"]) {
      expect({ name, cleared: migration.test(name) }).toEqual({
        name,
        cleared: PLACEHOLDER_NAME.test(name),
      });
    }
  });
});
