import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/lists/picker` — the add-to-list control's and the bulk selection bar's read,
 * off the Server Action queue (issue #481, following issue #480's `/api/search`).
 *
 * ── Why the collaborators are mocked rather than real ────────────────────────────────
 *
 * `@/lib/session` is mocked for the same reason `tests/search-route.test.ts` mocks it:
 * resolving a real session needs `next/headers`' request scope, which nothing here runs
 * inside. `@/cache/tags`'s `cachedLists` wraps `unstable_cache` around real,
 * Postgres-backed `listLists` (`tests/lists.test.ts` covers that query itself); what this
 * file asserts is the route's own branching — the session check and a failure's
 * reference — not the query a second time.
 */
vi.mock("@/lib/session", () => ({ signedInUserId: vi.fn() }));
vi.mock("@/cache/tags", () => ({ cachedLists: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  getClient: vi.fn(() => ({ getDsn: () => "https://key@o0.ingest.sentry.io/0" })),
  captureException: vi.fn(() => "test-event-id"),
}));

const { signedInUserId } = await import("@/lib/session");
const { cachedLists } = await import("@/cache/tags");
const { GET } = await import("@/app/api/lists/picker/route");

function list(id: string, name: string) {
  return { id, name, titleCount: 0, posters: [] };
}

beforeEach(() => {
  vi.mocked(signedInUserId).mockReset();
  vi.mocked(cachedLists).mockReset();
});

describe("GET /api/lists/picker", () => {
  it("answers 401 with signedOut when there is no session", async () => {
    vi.mocked(signedInUserId).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ signedOut: true });
    expect(cachedLists).not.toHaveBeenCalled();
  });

  it("answers 200 with ListsForPickerOutcome for a signed-in reader", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);
    vi.mocked(cachedLists).mockResolvedValue([list("a", "Comfort shows"), list("b", "Rewatch")]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      lists: [list("a", "Comfort shows"), list("b", "Rewatch")],
    });
    expect(cachedLists).toHaveBeenCalledWith("user-1");
  });

  it("answers a failed read with { ok: false, reference }, built from referenceFor", async () => {
    vi.mocked(signedInUserId).mockResolvedValue("user-1" as never);
    vi.mocked(cachedLists).mockRejectedValue(new Error("Postgres is down"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: false, reference: "test-event-id" });
  });
});
