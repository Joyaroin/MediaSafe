import type { NativeImportFile, NativeImportTitle, NativeImportWatch } from "./native-format";

/**
 * Splitting a parsed file into the pages the import screen (#73) drives over the wire.
 *
 * ── Why this exists as its own pure function ──────────────────────────────────────────
 *
 * `SPEC.md` §7 sizes a chunk at ~25 titles, forced by two verified Vercel Hobby limits
 * (300s function duration, 4.5 MB body) — not by anything about the data itself. Cutting
 * on titles and carrying each title's watches along with it is what keeps every chunk
 * self-contained: `applyImportChunk` (#72) resolves a watch through the episode ids its
 * own `titles` mirrored, and throws on a watch whose episode none of them carries. A
 * chunker that cut on watch count instead, or that let a title land in one request and its
 * watches in the next, would manufacture exactly that failure on a real file.
 *
 * Pure and synchronous, so the import screen can build every chunk once, up front, from a
 * file it has already read into memory — no TMDB, no server, nothing async.
 */

/** ~25 titles, per `SPEC.md` §7. */
export const IMPORT_CHUNK_SIZE = 25;

/** One page of a file: a slice of `titles`, and only the watches that belong to them. */
export interface FileChunk {
  readonly titles: readonly NativeImportTitle[];
  readonly watches: readonly NativeImportWatch[];
}

export function chunkImportFile(
  file: NativeImportFile,
  size: number = IMPORT_CHUNK_SIZE,
): FileChunk[] {
  const chunks: FileChunk[] = [];

  for (let start = 0; start < file.titles.length; start += size) {
    const titles = file.titles.slice(start, start + size);
    const tmdbIds = new Set(titles.map((title) => title.tmdbId));
    const watches = file.watches.filter((watch) => tmdbIds.has(watch.tmdbId));
    chunks.push({ titles, watches });
  }

  return chunks;
}
