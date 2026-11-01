import { afterEach, describe, expect, it, vi } from "vitest";

import { readRoute, SignedOutError } from "@/app/read-route";

/**
 * `readRoute` — the client-side fetch every signed-in `GET` Route Handler goes through
 * (issue #480). It has exactly one job beyond `fetch` itself: turn *there is nobody
 * signed in* into one behaviour, whichever of the two shapes it arrives in, and leave
 * everything else — success, a genuine failure, a cancelled request — for the caller to
 * tell apart.
 *
 * `window.location.assign` is stubbed rather than called for real: this file runs under
 * Vitest's `node` environment, which has no `window` at all, and asserting the one call
 * this module makes to it is the whole point of stubbing it in.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("readRoute", () => {
  it("resolves the parsed JSON on a signed-in success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, results: [] })),
    );

    await expect(readRoute("/api/search?q=dune")).resolves.toEqual({
      ok: true,
      results: [],
    });
  });

  it("sends the reader to sign-in and throws SignedOutError on a 401", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ signedOut: true }, { status: 401 })),
    );

    await expect(readRoute("/api/search?q=dune")).rejects.toBeInstanceOf(SignedOutError);
    expect(assign).toHaveBeenCalledWith("/sign-in");
  });

  it("treats a response redirected to /sign-in the same as a 401", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    // The proxy's own redirect: a plain 200 by the time `fetch` follows it, distinguished
    // only by `redirected` and the final `url` — never by status.
    const redirectedToSignIn = {
      status: 200,
      redirected: true,
      url: "http://localhost/sign-in",
      json: async () => ({}),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => redirectedToSignIn));

    await expect(readRoute("/api/search?q=dune")).rejects.toBeInstanceOf(SignedOutError);
    expect(assign).toHaveBeenCalledWith("/sign-in");
  });

  it("does not treat an ordinary redirect elsewhere as signed-out", async () => {
    const redirectedElsewhere = {
      status: 200,
      redirected: true,
      url: "http://localhost/api/search",
      json: async () => ({ ok: true, results: [] }),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => redirectedElsewhere));

    await expect(readRoute("/api/search?q=dune")).resolves.toEqual({
      ok: true,
      results: [],
    });
  });

  it("throws on a response that cannot be parsed as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );

    await expect(readRoute("/api/search?q=dune")).rejects.toThrow();
  });

  it("propagates a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("the network is down");
      }),
    );

    await expect(readRoute("/api/search?q=dune")).rejects.toThrow("the network is down");
  });

  it("rejects with the platform AbortError when the signal is aborted", async () => {
    // The real global `fetch`, not a stub: an already-aborted signal is rejected by the
    // platform before any request is sent, which is the behaviour being proved.
    const controller = new AbortController();
    controller.abort();

    await expect(
      readRoute("http://localhost/api/search?q=dune", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
