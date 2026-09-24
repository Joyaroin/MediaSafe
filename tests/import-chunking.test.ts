import { describe, expect, it } from "vitest";

import { chunkImportFile, IMPORT_CHUNK_SIZE } from "@/import/chunking";
import type { NativeImportFile } from "@/import/native-format";

/**
 * `import/chunking.ts` (issue #73) — the client-side half of the ~25-title
 * pages. Pure, so every case here runs with no network and no server action behind it.
 *
 * The one property worth a test on its own: a watch never lands in a different chunk from
 * the title it belongs to, because `applyImportChunk` (#72) throws on a watch whose
 * episode none of the chunk's titles carries.
 */

function titleFile(titleCount: number, watchesPerTitle: number): NativeImportFile {
  const titles = Array.from({ length: titleCount }, (_, index) => ({
    tmdbId: index + 1,
    kind: "show" as const,
    abandoned: false,
  }));

  const watches = titles.flatMap((title) =>
    Array.from({ length: watchesPerTitle }, (_, occurrence) => ({
      tmdbId: title.tmdbId,
      tmdbEpisodeId: title.tmdbId * 1000 + occurrence,
      watchedAt: null,
      key: `${title.tmdbId * 1000 + occurrence}:1`,
    })),
  );

  return { source: "test-fixture", titles, watches };
}

describe("chunkImportFile", () => {
  it("groups titles into chunks of the given size", () => {
    const chunks = chunkImportFile(titleFile(62, 0), 25);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.titles).toHaveLength(25);
    expect(chunks[1]!.titles).toHaveLength(25);
    expect(chunks[2]!.titles).toHaveLength(12);
  });

  it("defaults to the chunk size of ~25", () => {
    const chunks = chunkImportFile(titleFile(50, 0));
    expect(chunks[0]!.titles).toHaveLength(IMPORT_CHUNK_SIZE);
  });

  it("keeps every watch in the same chunk as the title it belongs to", () => {
    const chunks = chunkImportFile(titleFile(30, 2), 25);

    for (const chunk of chunks) {
      const titleIds = new Set(chunk.titles.map((title) => title.tmdbId));
      for (const watch of chunk.watches) {
        expect(titleIds.has(watch.tmdbId)).toBe(true);
      }
    }

    // Nothing lost and nothing duplicated across the boundary.
    const totalWatches = chunks.reduce((sum, chunk) => sum + chunk.watches.length, 0);
    expect(totalWatches).toBe(60);
  });

  it("returns no chunks for a file with no titles", () => {
    expect(chunkImportFile(titleFile(0, 0), 25)).toEqual([]);
  });

  it("21 titles with no watches still become their own chunk", () => {
    // Titles and watches are independent, and a title with nothing to
    // watch is not a title chunking may drop.
    const chunks = chunkImportFile(titleFile(21, 0), 25);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.titles).toHaveLength(21);
    expect(chunks[0]!.watches).toHaveLength(0);
  });
});
