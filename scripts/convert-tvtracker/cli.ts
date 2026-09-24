import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ConversionHalt,
  TVTRACKER_ACCOUNT_ID,
  convertTvtrackerExport,
  parseConfirmFile,
  type ConversionAccounting,
  type StragglerReport,
} from "./map";
import { parseTvtrackerDump } from "./parse";
import { resolveEpisodeIndex } from "./resolve";

/**
 * `npm run convert:tvtracker` — the whole conversion, run once (issues #61, #68).
 *
 * Reads the rescued export, resolves episode ids against TMDB, runs #71's pure mapping and
 * writes `fixtures/mediasafe-seed.json`. Every judgement lives in `map.ts`; this file is
 * the IO shell and the accounting.
 *
 * ── This is the only program permitted to read the archive ────────────────────────────
 *
 * `fixtures/` holds the only surviving copy of `tvtracker`'s database, and
 * `tests/fixture-archive.test.ts` keeps an allowlist of exactly two files that may name
 * it: this one, and test 1 of the four. Nothing else, and the check fails for anything
 * else.
 *
 * ── It prints what it dropped, not only what it wrote ─────────────────────────────────
 *
 * #61: *"the CLI prints an accounting of what it wrote **and what it dropped**, so the
 * arithmetic can be checked before anything is imported."* A conversion that reports only
 * its successes is one whose losses are invisible, and the losses here are somebody's
 * viewing history.
 *
 * ── It writes nothing when it halts ───────────────────────────────────────────────────
 *
 * The file is written last, after the mapping has returned. A halt leaves the previous
 * seed exactly as it was rather than truncating it into a partial one.
 */

const REPO = path.resolve(import.meta.dirname, "..", "..");
const ARCHIVE = "tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz";
const SEED = path.join(REPO, "fixtures", "mediasafe-seed.json");
const CONFIRM = path.join(REPO, "scripts", "convert-tvtracker", "convert.confirm.json");

function readArchive(): string {
  return gunzipSync(readFileSync(path.join(REPO, "fixtures", ARCHIVE))).toString("utf8");
}

function describe(straggler: StragglerReport): string {
  return (
    `      ${straggler.name} (tmdb ${straggler.tmdbId}) — watched through ` +
    `${straggler.watchedThrough} of ${straggler.totalEpisodes}, ${straggler.markedWatched} named`
  );
}

function report(accounting: ConversionAccounting, bytes: number): void {
  const lines = [
    "",
    "  Wrote fixtures/mediasafe-seed.json",
    "",
    `    titles                 ${accounting.titlesWritten}`,
    `      of which abandoned   ${accounting.titlesAbandoned}`,
    `      with no watches      ${accounting.titlesWithNoWatches}   (watchlist entries)`,
    `    watches                ${accounting.watchesWritten}`,
    `      of which dated       ${accounting.watchesDated}`,
    `      of which rewatches   ${accounting.rewatches}   (keyed :2 and up)`,
    `    size                   ${(bytes / 1_000_000).toFixed(2)} MB`,
    "",
    "    read from the export",
    `      titles               ${accounting.titlesInExport}`,
    `      episode rows         ${accounting.overridesRead} for this account ` +
      `(${accounting.overridesMarkedWatched} watched, ${accounting.overridesMarkedNotWatched} not)`,
    "",
  ];

  if (accounting.wholeShowExpansions.length > 0) {
    lines.push("    expanded — watched right through, so every episode counts");
    lines.push(...accounting.wholeShowExpansions.map(describe), "");
  }
  if (accounting.confirmedExpansions.length > 0) {
    lines.push("    expanded — as answered in convert.confirm.json");
    lines.push(...accounting.confirmedExpansions.map(describe), "");
  }

  lines.push("    dropped");
  lines.push(...accounting.dropped.map((what) => `      ${what}`));
  lines.push(
    `      ${accounting.twoPartDuplicates} row(s) TV Time split that TMDB lists as one episode — ` +
      "the watch is already there",
    `      ${accounting.unplaceableDropped} watch(es) whose TV Time numbering TMDB does not share, ` +
      "accepted by name in convert.confirm.json",
  );
  lines.push("");

  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  console.log("  Reading the archive…");
  const dump = readArchive();
  const exported = parseTvtrackerDump(dump);

  const mine = exported.shows.filter((show) => show.userId === TVTRACKER_ACCOUNT_ID);
  console.log(
    `  ${exported.shows.length} titles in the export, ${mine.length} on this account. ` +
      "Resolving episode ids against TMDB…",
  );

  const tmdbIds = [...new Set(mine.map((show) => show.tmdbId))].sort((a, b) => a - b);
  const index = await resolveEpisodeIndex(tmdbIds, ({ done, total }) => {
    // One line, rewritten, so a two-minute run shows progress without 462 lines of it.
    if (done % 25 === 0 || done === total) {
      process.stdout.write(`\r  resolved ${done} of ${total} titles`);
    }
  });
  process.stdout.write("\n");

  const result = convertTvtrackerExport(dump, {
    accountId: TVTRACKER_ACCOUNT_ID,
    episodeIndex: index,
    confirmations: parseConfirmFile(JSON.parse(readFileSync(CONFIRM, "utf8"))),
  });

  const text = `${JSON.stringify(result.json, null, 2)}\n`;
  writeFileSync(SEED, text);
  report(result.accounting, Buffer.byteLength(text));
}

// `.catch` rather than a top-level `await`, matching `db/migrate.ts`: tsx compiles this to
// CJS, where top-level await is not available.
main().catch((error: unknown) => {
  process.exitCode = 1;

  if (error instanceof ConversionHalt) {
    // A halt is the script working. It is the export needing a person, not a crash, so it
    // is printed as the sentences it was written as rather than as a stack trace.
    console.error(`\n  The conversion stopped, and wrote nothing.\n\n${error.message}\n`);
    return;
  }
  console.error("\n  The conversion failed, and wrote nothing.\n");
  console.error(error);
});
