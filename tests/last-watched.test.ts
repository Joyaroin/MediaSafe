import { beforeEach, describe, expect, it, vi } from "vitest";

import { lastWatchedResponse, lastWatchedTokenFrom, lastWatchedUrl } from "@/lib/last-watched";

const access = vi.hoisted(() => ({
  lastWatchedOwner: vi.fn(),
  lastWatchedTitle: vi.fn(),
}));
vi.mock("@/db/access", () => access);
// The hour's cache (issue #529) is `tests/last-watched-route.test.ts`'s subject. Here it
// is a pass-through, because `unstable_cache` cannot run outside a Next request.
vi.mock("next/cache", () => ({
  unstable_cache: (callback: (...args: never[]) => Promise<unknown>) => callback,
}));

import { GET } from "@/app/api/last-watched/[token]/route";

/**
 * The last-watched link's answer — issue #528. `lastWatchedResponse` is the whole contract
 * a personal site relies on, so it is tested directly: no test calls a route handler's
 * `GET` against a database, and the headers are exactly what a copy-paste could get wrong.
 * The route's own two rules (a malformed token costs no query; a failed read is a 500, not
 * a 404) are tested below it with `db/access.ts` faked, since neither is about Postgres.
 */

const TOKEN = "a".repeat(43);

describe("lastWatchedResponse", () => {
  it("answers a title with 200, text/plain, any origin and an hour's keeping", async () => {
    const response = lastWatchedResponse("Severance");

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    });
    expect(await response.text()).toBe("Severance");
  });

  it("answers the title as stored: no quotes, no newline, no cut", async () => {
    const long = `${"Ö".repeat(300)} "quoted", 2: <b>the sequel</b>`;

    expect(await lastWatchedResponse(long).text()).toBe(long);
  });

  it("answers no title with a plain 404 that is never kept and allows any origin", async () => {
    const response = lastWatchedResponse(null);

    expect(response.status).toBe(404);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    // Nothing in it names why: it is the same body for every way of not having an answer.
    expect(await response.text()).toBe("Not found");
  });
});

describe("lastWatchedTokenFrom", () => {
  it("accepts exactly what the server mints: 43 base64url characters", () => {
    expect(lastWatchedTokenFrom(TOKEN)).toBe(TOKEN);
    expect(lastWatchedTokenFrom("A-_".repeat(14) + "Z")).not.toBeNull();
  });

  it.each([
    ["too short", "a".repeat(42)],
    ["too long", "a".repeat(44)],
    ["empty", ""],
    ["outside the alphabet", "a".repeat(42) + "+"],
    ["the calendar feed's suffix", `${TOKEN}.ics`],
    ["a path", `${TOKEN}/x`],
  ])("rejects a segment that is %s", (_name, segment) => {
    expect(lastWatchedTokenFrom(segment)).toBeNull();
  });
});

describe("lastWatchedUrl", () => {
  it("joins the origin, the path and the token, whatever slashes the origin ends in", () => {
    expect(lastWatchedUrl("https://example.test//", TOKEN)).toBe(
      `https://example.test/api/last-watched/${TOKEN}`,
    );
  });
});

describe("GET /api/last-watched/<token>", () => {
  beforeEach(() => {
    access.lastWatchedOwner.mockReset();
    access.lastWatchedTitle.mockReset();
  });

  const ask = (token: string) =>
    GET(new Request(`http://localhost/api/last-watched/${token}`), {
      params: Promise.resolve({ token }),
    });

  it("answers a malformed token with the 404 before any query", async () => {
    const response = await ask("not-a-token");

    expect(response.status).toBe(404);
    expect(access.lastWatchedOwner).not.toHaveBeenCalled();
    expect(access.lastWatchedTitle).not.toHaveBeenCalled();
  });

  it("answers a token nobody holds, or whose reader is not sharing, with the 404", async () => {
    access.lastWatchedOwner.mockResolvedValue(null);

    const response = await ask(TOKEN);

    expect(response.status).toBe(404);
    expect(access.lastWatchedOwner).toHaveBeenCalledWith(TOKEN);
    expect(access.lastWatchedTitle).not.toHaveBeenCalled();
  });

  it("answers a sharing reader's title", async () => {
    access.lastWatchedOwner.mockResolvedValue("reader-1");
    access.lastWatchedTitle.mockResolvedValue("Andor");

    const response = await ask(TOKEN);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Andor");
    expect(access.lastWatchedTitle).toHaveBeenCalledWith("reader-1");
  });

  it("answers a reader with no dated watch with the 404", async () => {
    access.lastWatchedOwner.mockResolvedValue("reader-1");
    access.lastWatchedTitle.mockResolvedValue(null);

    expect((await ask(TOKEN)).status).toBe(404);
  });

  it("lets a failed read throw, so Next answers 500, rather than answering 404", async () => {
    access.lastWatchedOwner.mockRejectedValue(new Error("database down"));
    await expect(ask(TOKEN)).rejects.toThrow("database down");

    access.lastWatchedOwner.mockResolvedValue("reader-1");
    access.lastWatchedTitle.mockRejectedValue(new Error("database down"));
    await expect(ask(TOKEN)).rejects.toThrow("database down");
  });
});
