import { describe, expect, it } from "vitest";

import { DEFAULT_SEED_FILE, parseArgs } from "@/scripts/db-seed";

/**
 * `parseArgs` — `npm run db:seed -- [file] [--user <id>]`'s own parsing, pulled out and
 * tested the way `scripts/build.ts`'s pure halves are: no library, and no database or
 * network needed to assert what two flags mean.
 */

describe("parseArgs", () => {
  it("defaults to the seed fixture and no named user", () => {
    expect(parseArgs([])).toEqual({ file: DEFAULT_SEED_FILE, userId: undefined });
  });

  it("takes the file as the bare positional argument", () => {
    expect(parseArgs(["tests/fixtures/native-import/sample.json"])).toEqual({
      file: "tests/fixtures/native-import/sample.json",
      userId: undefined,
    });
  });

  it("takes --user alongside the file, in either order", () => {
    expect(parseArgs(["seed.json", "--user", "abc123"])).toEqual({
      file: "seed.json",
      userId: "abc123",
    });
    expect(parseArgs(["--user", "abc123", "seed.json"])).toEqual({
      file: "seed.json",
      userId: "abc123",
    });
  });

  it("takes --user alone, defaulting the file", () => {
    expect(parseArgs(["--user", "abc123"])).toEqual({
      file: DEFAULT_SEED_FILE,
      userId: "abc123",
    });
  });

  it("refuses --user with no value", () => {
    expect(() => parseArgs(["--user"])).toThrow(/--user needs a value/);
  });

  it("refuses a third positional argument", () => {
    expect(() => parseArgs(["a.json", "b.json"])).toThrow(/Unexpected argument "b\.json"/);
  });
});
