import { describe, expect, it } from "vitest";

import { TmdbHttpError, isUnresolvedTitle } from "@/tmdb/mirror";

/**
 * `isUnresolvedTitle` (issue #73) — the one branch the two failure modes turn
 * on: a title TMDB cannot resolve is skipped, but a chunk failing for any other reason
 * halts. Collapsing the two — treating a rate limit or an outage as one more dead id —
 * was the bug this test guards against.
 */
describe("isUnresolvedTitle", () => {
  it("is true for TMDB's 404", () => {
    expect(isUnresolvedTitle(new TmdbHttpError(404, "TMDB answered 404 for /tv/1"))).toBe(true);
  });

  it("is false for a rate limit", () => {
    expect(isUnresolvedTitle(new TmdbHttpError(429, "TMDB answered 429 for /tv/1"))).toBe(false);
  });

  it("is false for a TMDB outage", () => {
    expect(isUnresolvedTitle(new TmdbHttpError(500, "TMDB answered 500 for /tv/1"))).toBe(false);
  });

  it("is false for a network fault that never reached TMDB at all", () => {
    expect(isUnresolvedTitle(new TypeError("fetch failed"))).toBe(false);
  });

  it("is false for something that is not an error at all", () => {
    expect(isUnresolvedTitle("nope")).toBe(false);
    expect(isUnresolvedTitle(undefined)).toBe(false);
  });
});
