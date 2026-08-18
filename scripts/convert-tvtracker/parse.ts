/**
 * `tvtracker`'s `pg_dump` text → the three row sets the conversion reads (issue #71).
 *
 * ── Why a parser rather than a database ───────────────────────────────────────────────
 *
 * `SPEC.md` §6 defines test 1 as *"the import mapping — a pure function in `scripts/`,
 * tested against the committed export"*. Loading 19k rows into Postgres to read them back
 * would make the mapping's test need a database, a migration and a fixture load; the dump
 * is already a text file, and turning text into rows is pure. So the parse lives here,
 * beside `map.ts`, and the assertion in `tests/tvtracker-conversion.test.ts` runs over the
 * **real archive** end to end. Only the gunzip is IO, and the test does that.
 *
 * ── What it reads, and what it refuses to guess ───────────────────────────────────────
 *
 * `public.shows` and `public.episode_overrides` carry the entire watch history —
 * `fixtures/README.md` measured `watch_events` empty, so *"the conversion script must read
 * those, not `watch_events`"*. `public.movies` is read only to be counted: it holds zero
 * rows today, and a film added before cutover would otherwise vanish without a word
 * (`map.ts` halts on one).
 *
 * This is a parser for **one file** — the `pg_dump` 17.6 output committed in `fixtures/`,
 * with `standard_conforming_strings = on`, so a doubled `''` is the only escape inside a
 * literal and a backslash is a backslash. It is not a general SQL reader, and it throws
 * rather than skip anything it does not recognise: a row silently dropped here is watch
 * history silently lost, which is the one failure this ticket exists to prevent.
 *
 * The shape that makes a careless parser wrong is worth naming, because it cost a count
 * once already (`tests/fixture-archive.test.ts` records it): `shows.overview` holds TMDB
 * synopses containing **literal newlines**, so a row is not a line and splitting on `\n`
 * silently loses titles.
 */

/** One row of `public.shows`, narrowed to the columns the conversion actually uses. */
export interface TvtrackerShowRow {
  readonly id: string;
  readonly userId: string;
  readonly tmdbId: number;
  readonly name: string;
  readonly totalEpisodes: number;
  readonly watchStatus: string;
  readonly watchedThrough: number;
  readonly isFavourite: boolean;
  readonly isPinned: boolean;
  /** The raw dump timestamp, or `null`. `map.ts` decides where it lands. */
  readonly lastWatchedAt: string | null;
}

/** One row of `public.episode_overrides` — an exception layered over the watermark. */
export interface TvtrackerOverrideRow {
  readonly userId: string;
  readonly showId: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly watched: boolean;
}

/** One row of `public.movies`. Only the owner matters; nothing maps a film yet. */
export interface TvtrackerMovieRow {
  readonly userId: string;
  readonly title: string;
}

export interface TvtrackerExport {
  readonly shows: readonly TvtrackerShowRow[];
  readonly overrides: readonly TvtrackerOverrideRow[];
  readonly movies: readonly TvtrackerMovieRow[];
}

/** A `NULL`, a string literal, a number or a boolean, as the dump spells them. */
type SqlValue = string | number | boolean | null;

/**
 * Index just past the single-quoted literal starting at `open`.
 *
 * The dump sets `standard_conforming_strings = on`, so `''` is the only escape and a
 * backslash inside a literal is a backslash.
 */
function endOfLiteral(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === "'") {
      if (text[i + 1] === "'") i += 2;
      else return i + 1;
    } else {
      i++;
    }
  }
  throw new Error("The export ends inside an unterminated string literal.");
}

/** The literal's contents, with doubled quotes collapsed back to one. */
function readLiteral(text: string, open: number, end: number): string {
  return text.slice(open + 1, end - 1).replaceAll("''", "'");
}

/**
 * The single `INSERT` statement for a table: from `INSERT` to its terminating `;`.
 *
 * Stopping at the semicolon is load-bearing rather than tidy — slicing to end-of-file
 * makes `shows` swallow `episode_overrides`, and makes `episode_overrides` swallow the
 * trailing `setval(…)` whose argument list is one more top-level group.
 *
 * `undefined` means `pg_dump` wrote no `INSERT` for the table, which is exactly how it
 * spells an empty one — the `-- Data for Name:` header is still there with nothing
 * beneath it. That is a real answer rather than a failure, so callers read it as zero
 * rows.
 */
function insertStatement(text: string, table: string): string | undefined {
  const start = text.indexOf(`INSERT INTO "public"."${table}"`);
  if (start < 0) return undefined;

  for (let i = start; i < text.length; i++) {
    if (text[i] === "'") {
      i = endOfLiteral(text, i) - 1;
      continue;
    }
    if (text[i] === ";") return text.slice(start, i + 1);
  }
  throw new Error(`The INSERT for public.${table} is not terminated.`);
}

/** The quoted column names between `INSERT INTO … (` and `) VALUES`. */
function columnNames(statement: string, table: string): readonly string[] {
  const match = /\(([^)]*)\)\s*VALUES/.exec(statement);
  if (!match) throw new Error(`The INSERT for public.${table} names no columns.`);
  return match[1].split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
}

/**
 * Split one row's body on top-level commas.
 *
 * A field is either a quoted literal — taken whole, commas and newlines and all — or a
 * bare token running to the next top-level comma.
 */
function splitRow(body: string): readonly SqlValue[] {
  const values: SqlValue[] = [];
  let i = 0;

  while (i <= body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;

    if (body[i] === "'") {
      const end = endOfLiteral(body, i);
      values.push(readLiteral(body, i, end));
      i = end;
      while (i < body.length && body[i] !== ",") {
        if (!/\s/.test(body[i])) {
          throw new Error(`The export has trailing text after a string literal: ${body[i]}`);
        }
        i++;
      }
    } else {
      const start = i;
      let depth = 0;
      while (i < body.length && !(body[i] === "," && depth === 0)) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")") depth--;
        i++;
      }
      values.push(interpretBare(body.slice(start, i).trim()));
    }

    if (i >= body.length) break;
    i++;
  }
  return values;
}

/** `NULL`, `true`, `false` or a number — everything a literal is not. */
function interpretBare(text: string): SqlValue {
  if (text === "NULL") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  const value = Number(text);
  if (text.length > 0 && Number.isFinite(value)) return value;
  throw new Error(`The export holds a value this parser does not recognise: ${text}`);
}

/** Every top-level `(…)` group after `VALUES`, as column-name → value records. */
function rowsOf(text: string, table: string): readonly Record<string, SqlValue>[] {
  const statement = insertStatement(text, table);
  if (statement === undefined) return [];

  const columns = columnNames(statement, table);
  const values = /\bVALUES\b/.exec(statement);
  if (!values) throw new Error(`The INSERT for public.${table} has no VALUES.`);

  const rows: Record<string, SqlValue>[] = [];
  let i = values.index + values[0].length;

  while (i < statement.length) {
    while (i < statement.length && statement[i] !== "(") {
      if (statement[i] === "'") i = endOfLiteral(statement, i);
      else i++;
    }
    if (i >= statement.length) break;

    const start = ++i;
    let depth = 0;
    while (i < statement.length) {
      const c = statement[i];
      if (c === "'") {
        i = endOfLiteral(statement, i);
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }

    const fields = splitRow(statement.slice(start, i));
    if (fields.length !== columns.length) {
      throw new Error(
        `A public.${table} row has ${fields.length} values for ${columns.length} columns. ` +
          "The export was not parsed the way it was written, so nothing is converted.",
      );
    }
    rows.push(Object.fromEntries(columns.map((column, index) => [column, fields[index]])));
    i++;
  }
  return rows;
}

function requireString(row: Record<string, SqlValue>, column: string, table: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`public.${table}.${column} is not text in the export: ${String(value)}`);
  }
  return value;
}

function requireNumber(row: Record<string, SqlValue>, column: string, table: string): number {
  const value = row[column];
  if (typeof value !== "number") {
    throw new Error(`public.${table}.${column} is not a number in the export: ${String(value)}`);
  }
  return value;
}

function requireBoolean(row: Record<string, SqlValue>, column: string, table: string): boolean {
  const value = row[column];
  if (typeof value !== "boolean") {
    throw new Error(`public.${table}.${column} is not a boolean in the export: ${String(value)}`);
  }
  return value;
}

function optionalString(
  row: Record<string, SqlValue>,
  column: string,
  table: string,
): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`public.${table}.${column} is neither text nor NULL: ${String(value)}`);
  }
  return value;
}

/**
 * Reads the decompressed data half of the archive. Pure — text in, rows out.
 *
 * Every column this returns is one the mapping reads. The dump's other columns are left
 * behind here rather than in `map.ts`, so *"no borrowed metadata reaches the file"* is a
 * property of the pipeline's first step: `overview`, `poster_path`, `backdrop_path`,
 * `first_air_date`, `tmdb_status`, `episode_runtime` and `legacy` are never carried
 * forward at all. `name` is the one borrowed field that survives the parse, and it exists
 * only so a halt can say *which show* stopped the run — `map.ts` never writes it into the
 * file.
 */
export function parseTvtrackerDump(sql: string): TvtrackerExport {
  const shows = rowsOf(sql, "shows").map((row) => ({
    id: requireString(row, "id", "shows"),
    userId: requireString(row, "user_id", "shows"),
    tmdbId: requireNumber(row, "tmdb_id", "shows"),
    name: requireString(row, "name", "shows"),
    totalEpisodes: requireNumber(row, "total_episodes", "shows"),
    watchStatus: requireString(row, "watch_status", "shows"),
    watchedThrough: requireNumber(row, "watched_through", "shows"),
    isFavourite: requireBoolean(row, "is_favourite", "shows"),
    isPinned: requireBoolean(row, "is_pinned", "shows"),
    lastWatchedAt: optionalString(row, "last_watched_at", "shows"),
  }));

  const overrides = rowsOf(sql, "episode_overrides").map((row) => ({
    userId: requireString(row, "user_id", "episode_overrides"),
    showId: requireString(row, "show_id", "episode_overrides"),
    seasonNumber: requireNumber(row, "season_number", "episode_overrides"),
    episodeNumber: requireNumber(row, "episode_number", "episode_overrides"),
    watched: requireBoolean(row, "watched", "episode_overrides"),
  }));

  const movies = rowsOf(sql, "movies").map((row) => ({
    userId: requireString(row, "user_id", "movies"),
    title: requireString(row, "title", "movies"),
  }));

  return { shows, overrides, movies };
}
