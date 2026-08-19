import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { applyImportChunk, resolveSeedUserId, type ImportChunk, type ImportChunkTitle } from "@/db/access";
import { readNativeImportFile, type NativeImportFile } from "@/import/native-format";
import {
  filmMirror,
  seasonNumbers,
  SHOW_EXTERNAL_IDS_APPEND,
  showMirror,
  type TitleKind,
  type TitleMirror,
  type TmdbMoviePayload,
  type TmdbSeasonPayload,
  type TmdbShowPayload,
} from "@/tmdb/mirror";

/**
 * `npm run db:seed` — the other driver of import (issue #74).
 *
 * `SPEC.md` §6 seeds preview and local **by running MediaSafe's own import**, so this
 * calls `applyImportChunk` — the same writer the browser drives (issue #72) — rather
 * than opening a second connection of its own. There is no `psql` restore and no
 * direct-insert script; if this stopped calling that function, it would be the second
 * data path build step 3 exists to escape.
 *
 * It does not POST at a running server. That would need a live deployment and a minted
 * session just to seed a local database, and what this ticket protects is that the
 * *write* is identical, not that the transport is.
 *
 * ── Why it does not import `tmdb/catalogue.ts` ────────────────────────────────────────
 *
 * `readNativeImportFile` gives back facts about an account — a `tmdb_id`, a kind, a
 * judgement — never a name or a poster path (`import/native-format.ts`). Building the
 * `TitleMirror` `applyImportChunk` needs means calling TMDB, which is what
 * `tmdb/catalogue.ts` does — except that file is marked `server-only`, which throws on
 * import outside Next's own build (`tests/programme-note.test.ts` documents the same
 * wall). This script runs under `tsx`, not Next, so it carries its own thin TMDB client
 * below rather than importing one that would crash on line one. It calls the same three
 * endpoints `titleMirror` does and hands their payloads to the same pure mapping —
 * `filmMirror`, `showMirror`, `seasonNumbers` from `@/tmdb/mirror` — so the
 * interpretation of a response is identical between the import screen and this CLI; only
 * the fetch is duplicated, and that half is deliberately untested in `tmdb/catalogue.ts`
 * too, for the same reason: it is a URL, a header and `fetch`, with nothing to assert
 * that a mock of TMDB would not simply assert about itself.
 *
 * ── Which account, and why guessing is refused ────────────────────────────────────────
 *
 * `resolveSeedUserId` (`db/access.ts`) is the only place that turns `--user` — or its
 * absence — into a `UserId`. Every query this script needs runs through `db/access.ts`;
 * ESLint's data-access choke point covers `scripts/` deliberately (`eslint.config.mjs`),
 * so there is nowhere else for a query to hide.
 */

/** TMDB's API Read Access Token — the same variable `tmdb/catalogue.ts` reads. */
function bearerToken(): string {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "TMDB_READ_ACCESS_TOKEN is not set. The import file carries no metadata by " +
        "design (import/native-format.ts) — db:seed needs TMDB's API Read Access " +
        "Token to fetch it. See docs/local-development.md.",
    );
  }
  return token;
}

const TMDB_API = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 8_000;
/** Matches `tmdb/catalogue.ts` — six season requests in flight per show, at most. */
const SEASON_CONCURRENCY = 6;

async function get<T>(requestPath: string): Promise<T> {
  const response = await fetch(`${TMDB_API}${requestPath}`, {
    headers: {
      Authorization: `Bearer ${bearerToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`TMDB answered ${response.status} for ${requestPath}`);
  }
  return (await response.json()) as T;
}

async function inBatches<In, Out>(
  items: readonly In[],
  size: number,
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

async function fetchTitleMirror(kind: TitleKind, tmdbId: number): Promise<TitleMirror> {
  if (kind === "film") {
    return filmMirror(await get<TmdbMoviePayload>(`/movie/${tmdbId}`));
  }

  // The same request `tmdb/catalogue.ts` makes, including the append — a show fetched
  // without it mirrors a null external id and says nothing about why.
  const show = await get<TmdbShowPayload>(
    `/tv/${tmdbId}?append_to_response=${SHOW_EXTERNAL_IDS_APPEND}`,
  );
  const seasons = await inBatches(seasonNumbers(show), SEASON_CONCURRENCY, (number) =>
    get<TmdbSeasonPayload>(`/tv/${tmdbId}/season/${number}`),
  );
  return showMirror(show, seasons);
}

/** Ships against #69's sample today; the real fixture lands from a separate ticket. */
export const DEFAULT_SEED_FILE = "fixtures/mediasafe-seed.json";

export interface SeedArgs {
  readonly file: string;
  readonly userId: string | undefined;
}

/**
 * `npm run db:seed -- [file] [--user <id>]`. No library: two flags is not where an
 * argument parser earns its keep.
 */
export function parseArgs(argv: readonly string[]): SeedArgs {
  let file: string | undefined;
  let userId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--user") {
      i++;
      userId = argv[i];
      if (userId === undefined) {
        throw new Error("--user needs a value: the id of the account to seed.");
      }
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new Error(
        `Unexpected argument "${arg}". Usage: npm run db:seed -- [file] [--user <id>]`,
      );
    }
  }

  return { file: file ?? DEFAULT_SEED_FILE, userId };
}

/**
 * Every title in the file, mirrored from TMDB, in file order — sequentially, matching
 * `applyImportChunk`'s own reasoning for writing one title at a time rather than
 * batching: a seed run once is not where this needs to spend its concurrency budget, and
 * the progress line below is worth more than the time saved.
 */
export async function buildChunk(file: NativeImportFile): Promise<ImportChunk> {
  const titles: ImportChunkTitle[] = [];

  for (const [index, one] of file.titles.entries()) {
    console.log(
      `[db:seed] fetching ${index + 1} of ${file.titles.length}: ${one.kind} ${one.tmdbId}`,
    );
    const mirror = await fetchTitleMirror(one.kind, one.tmdbId);
    titles.push({ mirror, abandoned: one.abandoned });
  }

  return { source: file.source, titles, watches: file.watches };
}

export async function runSeed(args: SeedArgs): Promise<void> {
  // Fails loudly before reading the file or touching the database — not at title 1 of
  // 462, wearing a stack trace from three modules away.
  bearerToken();

  const absolutePath = path.resolve(process.cwd(), args.file);
  const file = readNativeImportFile(readFileSync(absolutePath, "utf8"));

  const userId = await resolveSeedUserId(args.userId);
  const chunk = await buildChunk(file);
  const outcome = await applyImportChunk(userId, chunk);

  // The same three figures the import screen's progress line shows (`SPEC.md` §7).
  console.log(
    `[db:seed] ${outcome.titlesAdded} of ${chunk.titles.length} titles · ` +
      `${outcome.watchesAdded} watches · ${outcome.arrivedAbandoned} marked abandoned`,
  );
}

/** True when this module was executed directly rather than imported. */
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntry()) {
  runSeed(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error("[db:seed] failed.");
    console.error(error);
    process.exitCode = 1;
  });
}
