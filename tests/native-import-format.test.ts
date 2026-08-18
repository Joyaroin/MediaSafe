import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseNativeImportFile, readNativeImportFile } from "@/import/native-format";

/**
 * `import/native-format.ts` (issue #69) — the shape #71, #72, #73 and #74 all build
 * against. Refusal is the whole job: every case below either accepts a file the app is
 * willing to write, or throws a plain sentence naming what is wrong. Nothing here catches
 * and returns an empty import — `mediasafe/no-empty-catch` applies literally to this file,
 * so every failure mode is asserted as a `throw`, never as a fallback value.
 */

const SAMPLE_PATH = path.join(
  import.meta.dirname,
  "fixtures",
  "native-import",
  "sample.json",
);

interface RawTitle {
  tmdb_id: number;
  kind: string;
  abandoned: boolean;
}

interface RawWatch {
  tmdb_id: number;
  tmdb_episode_id: number;
  watched_at: string | null;
  key: string;
}

interface RawFile {
  source: string;
  titles: RawTitle[];
  watches: RawWatch[];
}

function validFile(): RawFile {
  return {
    source: "test-fixture",
    titles: [
      { tmdb_id: 1416, kind: "show", abandoned: false },
      { tmdb_id: 94605, kind: "show", abandoned: true },
    ],
    watches: [{ tmdb_id: 1416, tmdb_episode_id: 62085, watched_at: null, key: "62085:1" }],
  };
}

describe("parseNativeImportFile — the shape it accepts", () => {
  it("accepts a well-formed file", () => {
    const parsed = parseNativeImportFile(validFile());
    expect(parsed.source).toBe("test-fixture");
    expect(parsed.titles).toHaveLength(2);
    expect(parsed.watches).toHaveLength(1);
  });

  it("keeps titles and watches independent — a title with no watches is valid", () => {
    const file = validFile();
    file.watches = [];
    const parsed = parseNativeImportFile(file);
    expect(parsed.titles).toHaveLength(2);
    expect(parsed.watches).toHaveLength(0);
  });

  it("accepts an undated watch", () => {
    const parsed = parseNativeImportFile(validFile());
    expect(parsed.watches[0]?.watchedAt).toBeNull();
  });

  it("accepts a dated watch", () => {
    const file = validFile();
    file.watches[0]!.watched_at = "2025-11-03T00:00:00.000Z";
    const parsed = parseNativeImportFile(file);
    expect(parsed.watches[0]?.watchedAt).toBe("2025-11-03T00:00:00.000Z");
  });

  it("carries abandoned through as a boolean", () => {
    const parsed = parseNativeImportFile(validFile());
    expect(parsed.titles.find((title) => title.tmdbId === 94605)?.abandoned).toBe(true);
    expect(parsed.titles.find((title) => title.tmdbId === 1416)?.abandoned).toBe(false);
  });
});

describe("parseNativeImportFile — refusing the wrong shape", () => {
  it.each([null, undefined, "a string", 42, ["an", "array"]])(
    "refuses a top-level value that is not an object (%p)",
    (value) => {
      expect(() => parseNativeImportFile(value)).toThrow(/must be a JSON object/);
    },
  );

  it("refuses a file missing source", () => {
    const file = validFile() as Partial<ReturnType<typeof validFile>>;
    delete file.source;
    expect(() => parseNativeImportFile(file)).toThrow(/"source" must be a non-empty string/);
  });

  it("refuses a file whose titles is not an array", () => {
    const file = { ...validFile(), titles: "not-an-array" };
    expect(() => parseNativeImportFile(file)).toThrow(/"titles" must be an array/);
  });

  it("refuses a file whose watches is not an array", () => {
    const file = { ...validFile(), watches: {} };
    expect(() => parseNativeImportFile(file)).toThrow(/"watches" must be an array/);
  });

  it("refuses an unexpected top-level field", () => {
    const file = { ...validFile(), exportedAt: "2026-08-18" };
    expect(() => parseNativeImportFile(file)).toThrow(/unexpected field "exportedAt"/);
  });

  it("refuses a title with a missing tmdb_id", () => {
    const file = validFile();
    delete (file.titles[0] as Partial<RawTitle>).tmdb_id;
    expect(() => parseNativeImportFile(file)).toThrow(/titles\[0\]\.tmdb_id must be a positive integer/);
  });

  it("refuses a title with a non-integer tmdb_id", () => {
    const file = validFile();
    file.titles[0]!.tmdb_id = 1.5 as number;
    expect(() => parseNativeImportFile(file)).toThrow(/titles\[0\]\.tmdb_id must be a positive integer/);
  });

  it("refuses a title whose kind is not film or show", () => {
    const file = validFile();
    file.titles[0]!.kind = "podcast";
    expect(() => parseNativeImportFile(file)).toThrow(/titles\[0\]\.kind must be "film" or "show"/);
  });

  it("refuses abandoned as a timestamp instead of a boolean", () => {
    const file = validFile();
    // @ts-expect-error — deliberately malformed for the test
    file.titles[0]!.abandoned = "2026-01-01T00:00:00.000Z";
    expect(() => parseNativeImportFile(file)).toThrow(
      /titles\[0\]\.abandoned must be a boolean, never a timestamp/,
    );
  });

  it("refuses a watch with a non-integer tmdb_episode_id", () => {
    const file = validFile();
    file.watches[0]!.tmdb_episode_id = -1;
    expect(() => parseNativeImportFile(file)).toThrow(
      /watches\[0\]\.tmdb_episode_id must be a positive integer/,
    );
  });

  it("refuses a watch whose watched_at is not a string or null", () => {
    const file = validFile();
    // @ts-expect-error — deliberately malformed for the test
    file.watches[0]!.watched_at = 12345;
    expect(() => parseNativeImportFile(file)).toThrow(
      /watches\[0\]\.watched_at must be null or an ISO date-time string/,
    );
  });

  it("refuses a watch whose watched_at does not parse as a date", () => {
    const file = validFile();
    file.watches[0]!.watched_at = "not-a-date";
    expect(() => parseNativeImportFile(file)).toThrow(/watches\[0\]\.watched_at is not a valid date/);
  });

  it("refuses a watch with an empty key", () => {
    const file = validFile();
    file.watches[0]!.key = "";
    expect(() => parseNativeImportFile(file)).toThrow(/watches\[0\]\.key must be a non-empty string/);
  });

  it("refuses a watch naming a tmdb_id absent from titles", () => {
    const file = validFile();
    file.watches.push({
      tmdb_id: 999999,
      tmdb_episode_id: 1,
      watched_at: null,
      key: "1:1",
    });
    expect(() => parseNativeImportFile(file)).toThrow(
      /watches\[1\] names tmdb_id 999999, which is not in "titles"/,
    );
  });
});

describe("parseNativeImportFile — refusing borrowed metadata outright", () => {
  it.each(["name", "poster_path"])("refuses a title carrying %s", (field) => {
    const file = validFile();
    (file.titles[0] as unknown as Record<string, unknown>)[field] = "borrowed";
    expect(() => parseNativeImportFile(file)).toThrow(new RegExp(`unexpected field "${field}"`));
    expect(() => parseNativeImportFile(file)).toThrow(/never borrowed metadata/);
  });

  it.each(["air_date", "runtime", "name"])("refuses a watch carrying %s", (field) => {
    const file = validFile();
    (file.watches[0] as unknown as Record<string, unknown>)[field] = "borrowed";
    expect(() => parseNativeImportFile(file)).toThrow(new RegExp(`unexpected field "${field}"`));
    expect(() => parseNativeImportFile(file)).toThrow(/never borrowed metadata/);
  });
});

describe("readNativeImportFile — the text-to-file boundary", () => {
  it("parses well-formed JSON text", () => {
    const parsed = readNativeImportFile(JSON.stringify(validFile()));
    expect(parsed.titles).toHaveLength(2);
  });

  it("throws — never falls back to an empty import — on malformed JSON", () => {
    expect(() => readNativeImportFile("{ this is not json")).toThrow(/not valid JSON/);
  });

  it("throws on a syntactically valid JSON value with the wrong shape", () => {
    expect(() => readNativeImportFile("[]")).toThrow(/must be a JSON object/);
  });
});

describe("the committed sample fixture", () => {
  const file = readNativeImportFile(readFileSync(SAMPLE_PATH, "utf8"));

  it("is not fixtures/mediasafe-seed.json", () => {
    expect(SAMPLE_PATH).not.toMatch(/fixtures[\\/]mediasafe-seed\.json$/);
    expect(SAMPLE_PATH).toContain(`${path.sep}tests${path.sep}`);
  });

  it("parses as a valid native import file", () => {
    expect(file.titles.length).toBeGreaterThan(0);
  });

  it("covers a title with no watches", () => {
    const withWatches = new Set(file.watches.map((watch) => watch.tmdbId));
    const withoutWatches = file.titles.filter((title) => !withWatches.has(title.tmdbId));
    expect(withoutWatches.length).toBeGreaterThan(0);
  });

  it("covers an abandoned title", () => {
    expect(file.titles.some((title) => title.abandoned)).toBe(true);
  });

  it("covers a season-0 watch (TMDB episode 63072, Game of Thrones' Specials)", () => {
    expect(file.watches.some((watch) => watch.tmdbEpisodeId === 63072)).toBe(true);
  });

  it("covers a dated watch", () => {
    expect(file.watches.some((watch) => watch.watchedAt !== null)).toBe(true);
  });
});
