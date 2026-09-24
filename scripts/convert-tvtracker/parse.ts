/**
 * `tvtracker`'s `pg_dump` text → the three row sets the conversion reads (issue #71).
 *
 * ── Why a parser rather than a database ───────────────────────────────────────────────
 *
 * Test 1 of the four is *"the import mapping — a pure function in `scripts/`,
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
  /**
   * Per-episode watch history, read out of `legacy`. Empty when the blob holds none.
   *
   * Keyed by `tvtracker`'s own `(season, episode)` — which is **TV Time's** numbering, not
   * TMDB's, and that divergence is what `map.ts` has to reconcile.
   */
  readonly history: readonly TvtrackerEpisodeWatches[];
}

/**
 * Every recorded watch of one episode, as `tvtracker`'s `legacy` blob holds it.
 *
 * `watchedAt` is one entry per watch, oldest first — so two entries is an episode watched
 * twice, and that is where `source_key`'s `:2` comes from. An **empty** list means the
 * episode was watched and no date survives, which is true of the rows that only ever
 * existed as `episode_overrides`.
 */
export interface TvtrackerEpisodeWatches {
  readonly season: number;
  readonly episode: number;
  readonly watchedAt: readonly string[];
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
 * The header `pg_dump` writes above every table it exported, empty ones included.
 *
 * This is what makes *"the table was empty"* distinguishable from *"the table was not
 * found"*, and the two must never collapse into each other — `AGENTS.md`
 * makes that the rule the whole codebase is built on, and here the stakes are that a
 * failure to find `shows` would otherwise convert to a valid, empty seed.
 */
function dataHeader(table: string): string {
  return `-- Data for Name: ${table}; Type: TABLE DATA; Schema: public`;
}

/**
 * **Every** `INSERT` statement for a table, each from `INSERT` to its terminating `;`.
 *
 * Stopping at the semicolon is load-bearing rather than tidy — slicing to end-of-file
 * makes `shows` swallow `episode_overrides`, and makes `episode_overrides` swallow the
 * trailing `setval(…)` whose argument list is one more top-level group.
 *
 * **All of them, not the first.** The committed archive holds one multi-row `INSERT` per
 * table, but `tvtracker` is re-exported at cutover and `pg_dump --inserts` without
 * `--rows-per-insert` writes *one statement per row*. Reading only the first would convert
 * that export to a single title and a single watch, and would say it had worked.
 */
function insertStatements(text: string, table: string): readonly string[] {
  const needle = `INSERT INTO "public"."${table}"`;
  const statements: string[] = [];

  let from = 0;
  for (;;) {
    const start = text.indexOf(needle, from);
    if (start < 0) return statements;

    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "'") {
        i = endOfLiteral(text, i) - 1;
        continue;
      }
      if (text[i] === ";") {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error(`The INSERT for public.${table} is not terminated.`);

    statements.push(text.slice(start, end + 1));
    from = end + 1;
  }
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
      // A bare field is `NULL`, `true`, `false` or a number — none of which can contain a
      // comma or a bracket, so the next comma ends it and `interpretBare` rejects anything
      // else rather than letting it through.
      const start = i;
      while (i < body.length && body[i] !== ",") i++;
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

/**
 * Every row of a table, across every `INSERT` that writes to it.
 *
 * **Not finding the table is a failure, not zero rows.** `pg_dump` writes a
 * `-- Data for Name:` header for every table it exported, including the empty ones, and
 * writes no `INSERT` beneath an empty one. So the header is what says *the table was
 * exported* and the `INSERT` is what says *it had rows*, and reading a missing header as
 * an empty table is the shape `AGENTS.md` forbids: it would turn an export this parser
 * cannot read — a dump without quoted identifiers, say — into a seed with no history in
 * it and no error anywhere.
 */
function rowsOf(text: string, table: string): readonly Record<string, SqlValue>[] {
  if (!text.includes(dataHeader(table))) {
    throw new Error(
      `The export has no data section for public.${table}. Every table pg_dump exported ` +
        "carries one, empty tables included, so its absence means this is not the export " +
        "this parser was written for — and an empty result would be indistinguishable from " +
        "a table that really was empty.",
    );
  }

  const statements = insertStatements(text, table);

  // The header says the table was exported; it does not say the `INSERT` beneath it is
  // one this parser can read. `pg_dump` without `--quote-all-identifiers` writes
  // `INSERT INTO public.shows`, which the exact match above skips — and skipping every
  // statement for a table looks precisely like a table that was empty. So the loose
  // spelling is counted too, and any statement found one way but not the other is a
  // failure rather than a row count.
  const loose =
    text.match(
      // The word boundary belongs to the bare spelling alone — after a closing quote
      // there is none, so `(?:"shows"|shows)\b` matches nothing at all.
      new RegExp(String.raw`INSERT INTO\s+(?:"public"|public)\s*\.\s*(?:"${table}"|${table}\b)`, "g"),
    ) ?? [];
  if (loose.length !== statements.length) {
    throw new Error(
      `The export writes ${loose.length} INSERT statement(s) for public.${table} and this ` +
        `parser could read ${statements.length} of them. It is written for pg_dump's quoted ` +
        "form, and reading the rest as zero rows would lose them without saying so.",
    );
  }

  return statements.flatMap((statement) => rowsIn(statement, table));
}

/** Every top-level `(…)` group after `VALUES`, as column-name → value records. */
function rowsIn(statement: string, table: string): readonly Record<string, SqlValue>[] {
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

const EPISODE_KEY = /^s(\d+)e(\d+)$/;

/**
 * `"2021-07-26 17:26:21"` and `"2026-07-22T05:34:17.711Z"` → one ISO instant.
 *
 * Two formats because there are two eras. TV Time's export wrote the first, space-separated
 * and with no zone; `tvtracker`'s own watch events wrote the second. The zoneless form is
 * read as UTC, which is the only reading available and is stated rather than hidden — every
 * other timestamp in this dump is `+00`, and the day boundary is a
 * read-time lens over a UTC instant rather than a stamp, so a fixed offset here would be
 * the wrong kind of correction anyway.
 */
function isoFrom(value: string): string | undefined {
  const spaced = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(value);
  if (spaced) return `${spaced[1]}T${spaced[2]}Z`;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return value.endsWith("Z") ? value : value;
  }
  return undefined;
}

/**
 * The watch history inside `legacy`, and **only** the watch history.
 *
 * ── Why this file reads `legacy` at all ───────────────────────────────────────────────
 *
 * Because it is the only place the per-episode record survives. `tvtracker`'s v3 tables
 * kept *which* episodes were watched and threw away *when* and *how many times*:
 * `episode_overrides` has no date column that means anything (its `watched_at` is the
 * v2-import stamp), and `watch_events` was never written to. The blob has both.
 *
 * Measured on this export: **19,678 per-episode timestamps across 455 titles**, spanning
 * 2021-07-26 to 2026-07-09 with 4,343 distinct values and **none** inside the 2026-08-03
 * import window — so they are viewing history, not stamps. And **1,209 episodes carry more
 * than one**, which is a rewatch: `len(dates) == episodeRewatchCounts + 1` holds for 18,423
 * of 18,443 episodes, so the two records corroborate each other and the dates are taken as
 * the authority.
 *
 * The spec and #16 §4 both said the library holds 18 genuine timestamps and no rewatch
 * data at all. Both conclusions were reached from the v3 tables without opening this blob,
 * and both are wrong. Reading it is what makes the seed the library rather than a sketch
 * of it.
 *
 * ── And why it is not a hole in "no borrowed metadata" ────────────────────────────────
 *
 * `legacy` also holds `title`, `posterPath`, `overview`, `firstAirDate` and TMDB match
 * bookkeeping. **None of it is read here.** Four fields come out — the episode keys, their
 * dates, their rewatch counts and the watch events — and every one of them is a fact about
 * *you*. The borrowed half never leaves this function, so nothing downstream can write it.
 */
function episodeWatchesFrom(legacy: string): readonly TvtrackerEpisodeWatches[] {
  let blob: unknown;
  try {
    blob = JSON.parse(legacy);
  } catch {
    // Reported, not swallowed. An unreadable blob is a title whose dates are gone, and
    // that is worth stopping for rather than silently converting as undated.
    throw new Error("A shows.legacy value is not valid JSON, so its watch history cannot be read.");
  }
  if (typeof blob !== "object" || blob === null) return [];

  const record = blob as Record<string, unknown>;
  const dates = new Map<string, string[]>();

  const add = (key: string, at: string | undefined): void => {
    if (!EPISODE_KEY.test(key)) return;
    const list = dates.get(key) ?? [];
    if (at !== undefined) list.push(at);
    dates.set(key, list);
  };

  const watchDates = record.episodeWatchDates;
  if (typeof watchDates === "object" && watchDates !== null) {
    for (const [key, value] of Object.entries(watchDates as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      for (const at of value) {
        if (typeof at === "string") add(key, isoFrom(at));
      }
      add(key, undefined);
    }
  }

  // The other era. A title watched inside `tvtracker` rather than imported from TV Time
  // records these instead, and the two never overlap — the 7 titles carrying events have
  // no `episodeWatchDates` at all, or none for those episodes.
  const events = record.watchEvents;
  if (Array.isArray(events)) {
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const { episodeKey, watchedAt } = event as Record<string, unknown>;
      if (typeof episodeKey !== "string") continue;
      add(episodeKey, typeof watchedAt === "string" ? isoFrom(watchedAt) : undefined);
    }
  }

  return [...dates].flatMap(([key, at]) => {
    const match = EPISODE_KEY.exec(key);
    if (!match) return [];
    return [
      {
        season: Number(match[1]),
        episode: Number(match[2]),
        // Oldest first, so occurrence `:1` is the first time it was watched.
        watchedAt: [...at].sort(),
      },
    ];
  });
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
    history: episodeWatchesFrom(requireString(row, "legacy", "shows")),
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
