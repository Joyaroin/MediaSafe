import type { TitleKind } from "@/tmdb/mirror";

/**
 * MediaSafe's native import format, declared once (issue #69, `SPEC.md` §7).
 *
 * ── Why this file exists at all ───────────────────────────────────────────────────────
 *
 * Step 3 is two halves that never touch each other: a conversion script that holds every
 * fact about `tvtracker` (issue #71), and an import writer that holds none of it
 * (issue #72). Neither can be built until the shape they agree on exists, so this ticket
 * ships that shape on its own, first.
 *
 * ── The one rule that matters more than the shape ─────────────────────────────────────
 *
 * `title` and `episode` are **global and unowned** — one row per TMDB id, shared by every
 * account (ADR-0001). A file that could write a name, a poster path, an air date or a
 * runtime would let one account rewrite what every account reads. So the native format
 * carries **facts about you and never borrowed metadata**, and `readNativeImportFile`
 * refuses a file that carries any of it rather than silently ignoring the field — a field
 * ignored today is a field somebody adds a writer for tomorrow.
 *
 * ── What is deliberately not here ─────────────────────────────────────────────────────
 *
 * Nothing in this file touches a filesystem, a database or TMDB. It takes the file's text
 * and either returns a value the app is willing to write, or throws. Nothing reads an
 * actual file outside a test yet — the CLI (#74) and the import screen (#73) are later
 * tickets, and both are meant to call `readNativeImportFile` rather than parse JSON
 * themselves, which is what keeps this the one place the shape is declared.
 */

/** A title in the file — a fact about you, never a name or a poster path. */
export interface NativeImportTitle {
  readonly tmdbId: number;
  readonly kind: TitleKind;
  /** Never a timestamp. Import mints `abandoned_at`; the file only carries the judgement. */
  readonly abandoned: boolean;
}

/**
 * One watch, keyed to the episode it happened on. `key` becomes `watch.source_key` —
 * `<tmdb_episode_id>:<occurrence>`, always `:1` in this file because there are no
 * rewatches to express (`SPEC.md` §7).
 */
export interface NativeImportWatch {
  readonly tmdbId: number;
  readonly tmdbEpisodeId: number;
  /** `null` = an undated watch: it happened, the file does not know when. */
  readonly watchedAt: string | null;
  readonly key: string;
}

/**
 * The whole file. `titles` and `watches` are independent — 21 real titles have no
 * watches at all, and are still valid entries on their own.
 */
export interface NativeImportFile {
  readonly source: string;
  readonly titles: readonly NativeImportTitle[];
  readonly watches: readonly NativeImportWatch[];
}

const TOP_LEVEL_FIELDS = ["source", "titles", "watches"] as const;
const TITLE_FIELDS = ["tmdb_id", "kind", "abandoned"] as const;
const WATCH_FIELDS = ["tmdb_id", "tmdb_episode_id", "watched_at", "key"] as const;

const BORROWED_METADATA_SENTENCE =
  "MediaSafe's native import format carries facts about you and never borrowed metadata — a name, poster path, air date or runtime on any entry is refused rather than ignored, because title and episode are global rows every account reads.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoExtraFields(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`${where} has an unexpected field "${key}". ${BORROWED_METADATA_SENTENCE}`);
    }
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** `raw[field]` must be a positive integer, or `where.field must be a positive integer.` */
function requirePositiveInteger(raw: Record<string, unknown>, field: string, where: string): number {
  const value = raw[field];
  if (!positiveInteger(value)) {
    throw new Error(`${where}.${field} must be a positive integer.`);
  }
  return value;
}

function parseTitle(raw: unknown, index: number): NativeImportTitle {
  const where = `titles[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${where} must be an object with tmdb_id, kind and abandoned.`);
  }
  assertNoExtraFields(raw, TITLE_FIELDS, where);

  const tmdbId = requirePositiveInteger(raw, "tmdb_id", where);
  if (raw.kind !== "film" && raw.kind !== "show") {
    throw new Error(`${where}.kind must be "film" or "show", not ${JSON.stringify(raw.kind)}.`);
  }
  if (typeof raw.abandoned !== "boolean") {
    throw new Error(
      `${where}.abandoned must be a boolean, never a timestamp — import mints the stamp, the file only carries the judgement.`,
    );
  }

  return { tmdbId, kind: raw.kind, abandoned: raw.abandoned };
}

function parseWatch(raw: unknown, index: number): NativeImportWatch {
  const where = `watches[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${where} must be an object with tmdb_id, tmdb_episode_id, watched_at and key.`);
  }
  assertNoExtraFields(raw, WATCH_FIELDS, where);

  const tmdbId = requirePositiveInteger(raw, "tmdb_id", where);
  const tmdbEpisodeId = requirePositiveInteger(raw, "tmdb_episode_id", where);
  if (raw.watched_at !== null && typeof raw.watched_at !== "string") {
    throw new Error(`${where}.watched_at must be null or an ISO date-time string.`);
  }
  if (typeof raw.watched_at === "string" && Number.isNaN(Date.parse(raw.watched_at))) {
    throw new Error(`${where}.watched_at is not a valid date: ${JSON.stringify(raw.watched_at)}.`);
  }
  if (typeof raw.key !== "string" || raw.key.length === 0) {
    throw new Error(`${where}.key must be a non-empty string.`);
  }

  return {
    tmdbId,
    tmdbEpisodeId,
    watchedAt: raw.watched_at,
    key: raw.key,
  };
}

/**
 * Validates an already-parsed JSON value and returns the file the app is willing to
 * write, or throws. Pure — no filesystem, no database, no TMDB.
 */
export function parseNativeImportFile(raw: unknown): NativeImportFile {
  if (!isPlainObject(raw)) {
    throw new Error('The import file must be a JSON object with "source", "titles" and "watches".');
  }
  assertNoExtraFields(raw, TOP_LEVEL_FIELDS, "The import file");

  if (typeof raw.source !== "string" || raw.source.length === 0) {
    throw new Error('"source" must be a non-empty string.');
  }
  if (!Array.isArray(raw.titles)) {
    throw new Error('"titles" must be an array.');
  }
  if (!Array.isArray(raw.watches)) {
    throw new Error('"watches" must be an array.');
  }

  const titles = raw.titles.map((entry, index) => parseTitle(entry, index));

  const knownTmdbIds = new Set(titles.map((title) => title.tmdbId));
  const watches = raw.watches.map((entry, index) => {
    const watch = parseWatch(entry, index);
    if (!knownTmdbIds.has(watch.tmdbId)) {
      throw new Error(
        `watches[${index}] names tmdb_id ${watch.tmdbId}, which is not in "titles". A watch may only reference a title the same file declares.`,
      );
    }
    return watch;
  });

  return { source: raw.source, titles, watches };
}

/**
 * Turns a file's raw text into the value the app is willing to write, or throws.
 *
 * A malformed `JSON.parse` is rethrown with the file named, not swallowed into an empty
 * import — `mediasafe/no-empty-catch` applies literally here: the shape that must not
 * exist is a parse falling back to zero titles.
 */
export function readNativeImportFile(text: string): NativeImportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // AGENTS.md — user-facing strings are plain sentences, never an exception message.
    throw new Error("The import file is not valid JSON.");
  }
  return parseNativeImportFile(raw);
}
