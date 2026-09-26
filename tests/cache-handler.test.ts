import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createCacheHandler } from "../cache-handler.mjs";

/**
 * The shared cache, as two pods see it.
 *
 * Every test builds **two** handlers on one real Valkey — `docker compose up -d valkey`
 * locally, a service container in CI — because the property this file exists for is the
 * one a single pod can never show: a bust on one pod reaches the other. Staging runs one
 * replica, so this is the only place that property is checked before production.
 *
 * Each test gets its own key prefix, so tests never see each other's entries.
 */

const VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379";

type Handler = ReturnType<typeof createCacheHandler>;
const open: Handler[] = [];

afterEach(() => {
  for (const handler of open.splice(0)) handler.close();
});

async function twoPods() {
  const prefix = `test:${randomUUID()}:`;
  const reports: string[] = [];
  const make = () =>
    createCacheHandler({
      url: VALKEY_URL,
      prefix,
      report: (operation: string) => reports.push(operation),
    });
  const a = make();
  const b = make();
  open.push(a, b);
  await Promise.all([a.connected, b.connected]);
  return { a, b, reports };
}

/** What `unstable_cache` writes: a FETCH entry whose body is the JSON of the result. */
function fetchEntry(result: unknown) {
  return {
    kind: "FETCH",
    data: { headers: {}, body: JSON.stringify(result), status: 200, url: "" },
    revalidate: false,
  };
}

const TAG = "library:user-1";

describe("the shared cache across two pods", () => {
  it("serves an entry one pod wrote to the other", async () => {
    const { a, b, reports } = await twoPods();

    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });

    expect((await b.get("k", { tags: [TAG] }))?.value).toEqual(fetchEntry(["dune"]));
    expect(reports).toEqual([]);
  });

  it("expires an entry on one pod when the other revalidates its tag", async () => {
    const { a, b } = await twoPods();
    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });

    await b.revalidateTag(TAG);

    expect(await a.get("k", { tags: [TAG] })).toBeNull();
  });

  /**
   * `revalidateTag(tag, "max")` is stale-while-revalidate in Next's own handler. Here it
   * is a miss, deliberately — `cache-handler.mjs` says why. What must never happen is
   * the old entry coming back as a hit, which for a read with no `revalidate` would be
   * forever.
   */
  it("answers a stale-while-revalidate bust with a miss, not the old entry", async () => {
    const { a, b } = await twoPods();
    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });

    await b.revalidateTag(TAG, { expire: 365 * 24 * 60 * 60 });

    expect(await a.get("k", { tags: [TAG] })).toBeNull();
  });

  it("serves what was written after the bust", async () => {
    const { a, b } = await twoPods();
    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });
    await b.revalidateTag(TAG);
    // Timestamps are milliseconds; make sure the rewrite is later than the bust.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await a.set("k", fetchEntry(["dune", "arrival"]), { tags: [TAG] });

    expect((await b.get("k", { tags: [TAG] }))?.value).toEqual(fetchEntry(["dune", "arrival"]));
  });

  it("honours a bust on a soft tag the reader passes", async () => {
    const { a, b } = await twoPods();
    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });

    await b.revalidateTag("_N_T_/library");

    expect(await a.get("k", { tags: [TAG], softTags: ["_N_T_/library"] })).toBeNull();
  });

  it("leaves entries under other tags alone", async () => {
    const { a, b } = await twoPods();
    await a.set("k", fetchEntry(["dune"]), { tags: [TAG] });

    await b.revalidateTag("library:user-2");

    expect(await a.get("k", { tags: [TAG] })).not.toBeNull();
  });

  it("round-trips the Buffers and Map a cached page carries", async () => {
    const { a, b } = await twoPods();
    const page = {
      kind: "APP_PAGE",
      html: "<p>hi</p>",
      rscData: Buffer.from("rsc"),
      segmentData: new Map([["/seg", Buffer.from("segment")]]),
      headers: { "x-next-cache-tags": TAG },
      status: 200,
    };

    await a.set("page", page);
    const read = (await b.get("page"))?.value;

    expect(read).toEqual(page);
    expect(Buffer.isBuffer(read.rscData)).toBe(true);
    expect(read.segmentData.get("/seg")?.toString()).toBe("segment");
  });
});

describe("with Valkey unreachable", () => {
  /**
   * A cache outage costs speed, not correctness: every read is a miss, so Next runs the
   * real query. Nothing throws into a render, and the lost invalidation is reported —
   * once, not once per call.
   */
  it("misses, never throws, and reports a lost invalidation once", async () => {
    const reports: string[] = [];
    const handler = createCacheHandler({
      url: "redis://127.0.0.1:1",
      prefix: `test:${randomUUID()}:`,
      report: (operation: string) => reports.push(operation),
    });
    open.push(handler);
    await handler.connected;

    expect(await handler.get("k", { tags: [TAG] })).toBeNull();
    await expect(handler.set("k", fetchEntry(["dune"]), { tags: [TAG] })).resolves.toBeUndefined();
    await handler.revalidateTag(TAG);
    await handler.revalidateTag(TAG);

    expect(reports.filter((operation) => operation === "revalidateTag")).toHaveLength(1);
    expect(reports).toContain("connection");
  });
});
