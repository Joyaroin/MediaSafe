import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/search` — Search's read, off the Server Action queue (issue #480).
 *
 * ── Why both collaborators are mocked rather than real ───────────────────────────────
 *
 * `@/tmdb/catalogue` is `import "server-only"`, which throws under plain Node module
 * resolution — the same constraint `tests/add-title-answering.test.ts` and
 * `tests/nightly-sweep-route.test.ts` document, and the reason neither imports it either.
 * `@/db/access`'s `libraryCatalogueKeys` is real, Postgres-backed code with its own
 * coverage at the real database in `tests/add-to-library.test.ts`; what is asserted here
 * is this route's own branching — the session check, the blank-query guard, the shape of
 * a found result, and a failure's reference — not that query a second time. Calling the
 * application pool directly from a route handler under Vitest is also exactly what
 * `db/client.ts`'s `getDb()` refuses to do by design, which a route handler (unlike
 * `addTitleAnswering`) has no way to route an injected executor around.
 *
 * `@/lib/session` is mocked for the same reason `@/tmdb/catalogue` is: resolving a real
 * session needs `next/headers`' request scope, which nothing here is running inside.
 */
vi.mock("@/lib/session", () => ({ signedInUserId: vi.fn() }));
vi.mock("@/tmdb/catalogue", () => ({ searchCatalogueOfKind: vi.fn() }));
vi.mock("@/db/access", () => ({ libraryCatalogueKeys: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  getClient: vi.fn(() => ({ getDsn: () => "https://key@o0.ingest.sentry.io/0" })),
  captureException: vi.fn(() => "test-event-id"),
}));

const { signedInUserId } = await import("@/lib/session");
const { searchCatalogueOfKind } = await import("@/tmdb/catalogue");
const { libraryCatalogueKeys } = await import("@/db/access");
const { GET } = await import("@/app/api/search/route");

function requestFor(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/search?${query}`);
}

function result(kind: "show" | "film", tmdbId: number) {
  return {
    kind,
    tmdbId,
    name: `Title ${tmdbId}`,
    releaseYear: 2022,
    posterPath: null,
    audienceScore: null,
  };
}

beforeEach(() => {
  vi.mocked(signedInUserId).mockReset();
  vi.mocked(searchCatalogueOfKind).mockReset();
  vi.mocked(libraryCatalogueKeys).mockReset();
});

describe("GET /api/search", () => {
  it("answers 401 with signedOut when there is no session", async () => {
    vi.mocked(signedInUserId).mockResolvedValue(null);

    const response = await GET(requestFor("q=dune"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ signedOut: true });
    expect(searchCatalogueOfKind).not.toHaveBeenCalled();
  });

  it("answers both kinds empty-but-ok for a blank q, without searching or reading the library", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);

    const response = await GET(requestFor("q=   "));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      show: { ok: true, results: [] },
      film: { ok: true, results: [] },
    });
    expect(searchCatalogueOfKind).not.toHaveBeenCalled();
    expect(libraryCatalogueKeys).not.toHaveBeenCalled();
  });

  it("answers both kinds empty-but-ok when q is missing entirely", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);

    const response = await GET(requestFor(""));

    await expect(response.json()).resolves.toEqual({
      show: { ok: true, results: [] },
      film: { ok: true, results: [] },
    });
  });

  it("answers 200 with BothKinds, marking an already-held result inLibrary", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);
    vi.mocked(searchCatalogueOfKind).mockImplementation(async (kind) =>
      kind === "show" ? [result("show", 1), result("show", 2)] : [result("film", 9)],
    );
    vi.mocked(libraryCatalogueKeys).mockImplementation(async (_userId, keys) =>
      new Set(
        keys
          .map((key) => `${key.kind}:${key.tmdbId}`)
          .filter((key) => key === "show:1"),
      ),
    );

    const response = await GET(requestFor("q=thrones"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.show).toEqual({
      ok: true,
      results: [
        { ...result("show", 1), inLibrary: true },
        { ...result("show", 2), inLibrary: false },
      ],
    });
    expect(body.film).toEqual({
      ok: true,
      results: [{ ...result("film", 9), inLibrary: false }],
    });
  });

  it("answers a kind's failure with { ok: false, reference }, built from referenceFor", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);
    vi.mocked(searchCatalogueOfKind).mockImplementation(async (kind) => {
      if (kind === "show") throw new Error("TMDB is down");
      return [result("film", 9)];
    });
    vi.mocked(libraryCatalogueKeys).mockResolvedValue(new Set());

    const response = await GET(requestFor("q=thrones"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.show).toEqual({ ok: false, reference: "test-event-id" });
    expect(body.film).toEqual({
      ok: true,
      results: [{ ...result("film", 9), inLibrary: false }],
    });
  });
});
