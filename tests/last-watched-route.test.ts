import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The last-watched route with its hour's cache in front of the title — issue #529.
 *
 * The properties under test are the two halves of one design: the title is worked out at
 * most once an hour per reader, and the token is looked up on **every** request, so that
 * switching sharing off or replacing the link answers `404` at once even while a title is
 * cached. The store behind both is a fake that behaves like `user`'s two columns, and the
 * cache is a stand-in that keeps a value for as long as it is asked about the same key —
 * enough to tell a request that read the title from one that was served it.
 *
 * What is not here: the SQL itself (`last-watched-access.test.ts`, against Postgres) and
 * the hour's length (`cache-tags.test.ts`, which reads the window off the cache's fake).
 */

const { store, titleQuery, cache } = vi.hoisted(() => ({
  store: {
    /** The one account's two columns. */
    token: null as string | null,
    sharing: false,
    title: "Solaris" as string | null,
  },
  titleQuery: vi.fn(),
  cache: new Map<string, unknown>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache(
    callback: (...args: never[]) => Promise<unknown>,
    keyParts?: string[],
  ) {
    return async (...args: never[]) => {
      const key = `${keyParts?.join(",")}-${JSON.stringify(args)}`;
      if (!cache.has(key)) cache.set(key, await callback(...args));
      return cache.get(key);
    };
  },
}));

const READER = "user_reader";

vi.mock("@/db/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/access")>()),
  lastWatchedOwner: async (token: string) =>
    store.sharing && store.token === token ? READER : null,
  lastWatchedTitle: titleQuery,
}));

const { GET } = await import("@/app/api/last-watched/[token]/route");

const A_TOKEN = "a".repeat(43);
const ANOTHER_TOKEN = "b".repeat(43);

function ask(token: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/last-watched/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  cache.clear();
  store.token = A_TOKEN;
  store.sharing = true;
  store.title = "Solaris";
  titleQuery.mockReset();
  titleQuery.mockImplementation(async () => store.title);
});

describe("GET /api/last-watched/<token> with the hour's cache", () => {
  it("answers the title, and runs the title query once for a second request", async () => {
    const first = await ask(A_TOKEN);
    const second = await ask(A_TOKEN);

    expect(first.status).toBe(200);
    expect(await first.text()).toBe("Solaris");
    expect(await second.text()).toBe("Solaris");
    expect(titleQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached title when a new watch lands inside the hour", async () => {
    await ask(A_TOKEN);

    store.title = "A film watched a moment ago";

    expect(await (await ask(A_TOKEN)).text()).toBe("Solaris");
  });

  it("answers 404 at once when sharing is switched off, with a title cached", async () => {
    await ask(A_TOKEN);

    store.sharing = false;
    const off = await ask(A_TOKEN);

    expect(off.status).toBe(404);
    expect(off.headers.get("Cache-Control")).toBe("no-store");
    expect(titleQuery).toHaveBeenCalledTimes(1);
  });

  it("brings the same link back, still serving the cached title, when sharing is switched on again", async () => {
    await ask(A_TOKEN);
    store.sharing = false;
    await ask(A_TOKEN);
    store.sharing = true;

    const back = await ask(A_TOKEN);

    expect(back.status).toBe(200);
    expect(await back.text()).toBe("Solaris");
  });

  it("retires the old link and answers the new one when a new link is made, with a title cached", async () => {
    await ask(A_TOKEN);

    store.token = ANOTHER_TOKEN;

    expect((await ask(A_TOKEN)).status).toBe(404);
    const fresh = await ask(ANOTHER_TOKEN);
    expect(fresh.status).toBe(200);
    expect(await fresh.text()).toBe("Solaris");
  });

  it("answers 404 for a reader with no dated watch", async () => {
    store.title = null;

    expect((await ask(A_TOKEN)).status).toBe(404);
  });

  it("costs no title query for a token of the wrong shape or an unknown one", async () => {
    expect((await ask("short")).status).toBe(404);
    expect((await ask("c".repeat(43))).status).toBe(404);
    expect(titleQuery).not.toHaveBeenCalled();
  });
});
