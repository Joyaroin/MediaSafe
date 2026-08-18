import { parseNativeImportFile, type NativeImportFile } from "@/import/native-format";

/**
 * `tvtracker`'s export → MediaSafe's native import file. Pure (issue #71, `SPEC.md` §7).
 *
 * ── The whole point of this file ──────────────────────────────────────────────────────
 *
 * This holds **all** `tvtracker` knowledge in the project. Import holds none: the native
 * file is already episode-grain, so `applyImportChunk` inserts what it is given and
 * interprets nothing. If a `tvtracker` symbol, column name or special case turns up under
 * `app/`, `db/` or `tmdb/`, it is on the wrong side of that line.
 *
 * It is also the highest-risk code in the project. `tvtracker`'s own `CLAUDE.md` called
 * the equivalent *"the highest-risk code here — a bug in it silently destroys watch
 * history"*, and here it reads the **only surviving copy** of that history: the Supabase
 * project and the source repository are both gone. A wrong answer is not loud and is not
 * recoverable from anything but `fixtures/`.
 *
 * So the rule throughout is **halt rather than guess**, with a human watching. Every
 * branch below that cannot be derived from the export ends in a `ConversionHalt` naming
 * the shows and the evidence.
 *
 * ── Pure, and what that buys ──────────────────────────────────────────────────────────
 *
 * No filesystem, no network, no TMDB, no clock, no randomness. `SPEC.md` §6's test 1 —
 * *"the import mapping, a pure function in `scripts/`, tested against the committed
 * export"* — is only possible because of that, and `tests/tvtracker-conversion.test.ts`
 * spends it: it runs this over the real archive and counts what comes out.
 *
 * The one thing the export cannot supply is **TMDB episode ids** — `episode_overrides` is
 * keyed `(show_id, season_number, episode_number)` and knows nothing about TMDB's episode
 * ids. #16 keyed the native format on the episode id anyway, deliberately: season and
 * episode numbers are borrowed attributes, and a renumber upstream would silently repoint
 * history. So resolution is an **input** here — `resolve.ts` fetches it from TMDB on the
 * IO side and passes it in, which keeps the mapping pure and keeps the numbering mismatch
 * a conversion-time failure instead of a preview-deploy mystery months later.
 *
 * ── What is deliberately dropped ──────────────────────────────────────────────────────
 *
 * Reported in `accounting` rather than buried in a comment, because the script's output is
 * where a person can see it: 4 favourites, 2 pins, `added_at` (every value is a v2-import
 * stamp from a 9-day window, not when a show was found), the `watched = false` rows except
 * where they subtract from an expansion, `tvtracker`'s test account, and every borrowed
 * field — `legacy`, `overview`, `backdrop_path`, `tmdb_status`, `episode_runtime`, and the
 * names and posters with them.
 */

import {
  parseTvtrackerDump,
  type TvtrackerExport,
  type TvtrackerOverrideRow,
  type TvtrackerShowRow,
} from "./parse";

/**
 * Adham's account in `tvtracker`'s dump.
 *
 * `fixtures/README.md` measured the export at **472 titles across two accounts**, of which
 * **462 are his**. The seed this conversion produces populates every preview and every
 * local database, and #18 decided *no environment outside production ever holds another
 * person's rows* — so an unfiltered conversion breaks that decision at the seed, silently,
 * because 472 rows look no more wrong than 462.
 *
 * The filter is not optional and there is no unfiltered code path: `accountId` is a
 * required option, and this constant exists so the CLI has the right value to pass rather
 * than so the mapping has a default to fall back on.
 */
export const TVTRACKER_ACCOUNT_ID = "21cbd8c5-628d-4dac-90e9-efb487c7c14a";

/** `watch.source` for everything this file writes. */
export const IMPORT_SOURCE = "tvtracker";

/** One episode, as TMDB numbers it. */
export interface EpisodeCoordinate {
  readonly season: number;
  readonly episode: number;
}

export interface IndexedEpisode extends EpisodeCoordinate {
  readonly tmdbEpisodeId: number;
}

/**
 * Every episode TMDB lists for a title, keyed by the title's TMDB id.
 *
 * Supplied by `resolve.ts`, which is the IO half. **Order does not matter** and is never
 * read — see `expandWholeShow` for why the mapping never converts an ordinal into a
 * coordinate, which is the single thing that would have made ordering load-bearing.
 */
export type EpisodeIndex = ReadonlyMap<number, readonly IndexedEpisode[]>;

/**
 * One human answer to one ambiguous watermark, from `convert.confirm.json`.
 *
 * `credit` is an explicit list of episodes, never a count, because a count would put the
 * guess back in the script: turning *"7 watches somewhere in 103 episodes"* into
 * coordinates is exactly the judgement the export cannot make. An **empty** `credit` is a
 * real answer too — it records that the watermark is stale and nothing should be written.
 */
export interface Confirmation {
  readonly tmdbId: number;
  /** For the person reading the file. The mapping matches on `tmdbId` alone. */
  readonly title: string;
  readonly reason: string;
  readonly credit: readonly EpisodeCoordinate[];
}

export interface ConfirmFile {
  readonly confirmations: readonly Confirmation[];
}

export interface ConversionOptions {
  /** Whose rows to convert. Required — there is no unfiltered conversion. */
  readonly accountId: string;
  readonly episodeIndex: EpisodeIndex;
  readonly confirmations: ConfirmFile;
}

/** A show whose watermark claims watches no override row names. */
export interface StragglerReport {
  readonly tmdbId: number;
  readonly name: string;
  readonly watchedThrough: number;
  readonly totalEpisodes: number;
  readonly markedWatched: number;
  readonly markedNotWatched: number;
  /** Watches the watermark claims that no override row accounts for. */
  readonly unaccountedFor: number;
}

/** What the conversion did, for the CLI to print where a person can see it. */
export interface ConversionAccounting {
  readonly titlesInExport: number;
  readonly titlesForOtherAccounts: number;
  readonly titlesWritten: number;
  readonly titlesWithNoWatches: number;
  readonly titlesAbandoned: number;
  readonly overridesRead: number;
  readonly overridesMarkedWatched: number;
  readonly overridesMarkedNotWatched: number;
  readonly watchesWritten: number;
  readonly watchesDated: number;
  readonly wholeShowExpansions: readonly StragglerReport[];
  readonly confirmedExpansions: readonly StragglerReport[];
  readonly dropped: readonly string[];
}

export interface ConversionResult {
  /** The file's contents, exactly as they should be written — snake_case, JSON-ready. */
  readonly json: NativeImportJson;
  /** The same file, validated by the app's own reader. */
  readonly file: NativeImportFile;
  readonly accounting: ConversionAccounting;
}

/** The file's on-disk shape. `import/native-format.ts` is the one declaration of it. */
export interface NativeImportJson {
  readonly source: string;
  readonly titles: readonly {
    readonly tmdb_id: number;
    readonly kind: "show";
    readonly abandoned: boolean;
  }[];
  readonly watches: readonly {
    readonly tmdb_id: number;
    readonly tmdb_episode_id: number;
    readonly watched_at: string | null;
    readonly key: string;
  }[];
}

/**
 * The conversion stopped rather than guess.
 *
 * A distinct type so a caller — and the test — can tell *"this export needs a human"* from
 * *"this code is broken"*. Both are failures and neither is recoverable by retrying, but
 * only one of them is answerable by editing `convert.confirm.json`.
 */
export class ConversionHalt extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionHalt";
  }
}

const coordinateKey = (season: number, episode: number): string => `${season}:${episode}`;

const describeCoordinate = ({ season, episode }: EpisodeCoordinate): string =>
  `S${season}E${episode}`;

/**
 * `tvtracker`'s timestamp as an ISO 8601 instant, by string surgery rather than `Date`.
 *
 * `Date` would round `2026-08-15 20:45:56.788631+00` to milliseconds and quietly drop the
 * microseconds. These are the only genuine viewing timestamps that survived, so they are
 * carried across exactly as they were recorded.
 */
function isoInstant(dumped: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00(?::00)?$/.exec(dumped);
  if (!match) {
    throw new ConversionHalt(
      `The export holds a timestamp this conversion does not recognise: ${dumped}. ` +
        "Nothing is converted rather than have a watch carry a date that was guessed at.",
    );
  }
  return `${match[1]}T${match[2]}Z`;
}

/**
 * The episode a title's `last_watched_at` belongs to: the furthest one watched.
 *
 * Specials lose to any regular season. Season 0 sorts first numerically but is not
 * *further along* a show than season 6, and `SPEC.md` §5 keeps specials out of every
 * derived state for the same reason.
 */
function furthestWatched(watched: readonly IndexedEpisode[]): IndexedEpisode | undefined {
  const ordered = [...watched].sort((a, b) => {
    const aSpecial = a.season === 0 ? 1 : 0;
    const bSpecial = b.season === 0 ? 1 : 0;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    if (a.season !== b.season) return b.season - a.season;
    return b.episode - a.episode;
  });
  return ordered[0];
}

function episodesFor(index: EpisodeIndex, show: TvtrackerShowRow): readonly IndexedEpisode[] {
  const episodes = index.get(show.tmdbId);
  if (episodes === undefined) {
    throw new ConversionHalt(
      `${show.name} (tmdb ${show.tmdbId}) has no episodes resolved. ` +
        "The conversion cannot key a watch to an episode it was never given, so nothing is converted.",
    );
  }
  return episodes;
}

/** Resolve one `(season, episode)` coordinate, or halt — never skip it. */
function resolveCoordinate(
  episodes: readonly IndexedEpisode[],
  show: TvtrackerShowRow,
  coordinate: EpisodeCoordinate,
  because: string,
): IndexedEpisode {
  const found = episodes.find(
    (episode) => episode.season === coordinate.season && episode.episode === coordinate.episode,
  );
  if (found === undefined) {
    throw new ConversionHalt(
      `${show.name} (tmdb ${show.tmdbId}) ${because} ${describeCoordinate(coordinate)}, ` +
        "which TMDB does not list for it. A numbering mismatch is not something this " +
        "conversion resolves on its own, so nothing is converted.",
    );
  }
  return found;
}

/**
 * A whole-show watermark: every episode, less the ones explicitly marked not watched.
 *
 * This **replaces** the show's `watched = true` overrides rather than adding to them, and
 * that is what makes the arithmetic come out. Schitt's Creek's lone override reads `S1E26`
 * — not a real coordinate for a show whose first season has thirteen episodes — so it is
 * legacy noise, harmless precisely because the whole show is marked anyway. Adding to the
 * overrides would have written a 80th watch against an episode that does not exist;
 * replacing them writes 79 and never resolves the bad coordinate at all.
 *
 * Note what is *not* here: no ordinal is ever turned into a coordinate. `watched_through`
 * is an absolute ordinal across the whole show, and *"the first 60 of 122 episodes"* would
 * need TMDB's ordering to mean anything. The only expansion this function performs is
 * *all of them*, where ordering cannot matter — every other case goes to a human.
 */
function expandWholeShow(
  show: TvtrackerShowRow,
  episodes: readonly IndexedEpisode[],
  notWatched: readonly TvtrackerOverrideRow[],
): readonly IndexedEpisode[] {
  if (episodes.length !== show.totalEpisodes) {
    throw new ConversionHalt(
      `${show.name} (tmdb ${show.tmdbId}) was watched right through ${show.totalEpisodes} ` +
        `episodes, but TMDB now lists ${episodes.length}. Expanding the watermark would ` +
        "write a number of watches that the export does not support, so nothing is converted.",
    );
  }

  // Resolved rather than merely keyed, so a not-watched row naming an episode TMDB does
  // not list halts instead of silently subtracting nothing — which would write one watch
  // too many and look exactly like a correct run.
  const excluded = new Set(
    notWatched
      .map((row) =>
        resolveCoordinate(
          episodes,
          show,
          { season: row.seasonNumber, episode: row.episodeNumber },
          "records not having watched",
        ),
      )
      .map((episode) => coordinateKey(episode.season, episode.episode)),
  );

  return episodes.filter((episode) => !excluded.has(coordinateKey(episode.season, episode.episode)));
}

/**
 * `abandoned` on a title: `tvtracker`'s hand-set judgement, carried and not invented.
 *
 * `Paused` is `abandoned` spelled `tvtracker`'s way — `CONTEXT.md`'s *Avoid* line for
 * **Abandoned** lists *paused* first — and #25 extended it to `Completed` shows that are
 * not actually finished, which is the same judgement written in the other of the two boxes
 * `tvtracker` offered. Both are *"I have stopped watching this"*.
 *
 * The third clause is the one that is easy to leave out and changes the count: **a title
 * with no watches at all is on the watchlist, not abandoned.** You cannot abandon
 * something you never started, and 2 `Paused` titles in the export have zero watches.
 *
 * On the day-one export this is 65 `Paused` + 90 short `Completed` = **155**, and the rest
 * of `SPEC.md` §7's arrival split falls out of the same numbers: 62 watching, 22 watchlist,
 * 223 finished-or-caught-up.
 */
function isAbandoned(show: TvtrackerShowRow, watchCount: number): boolean {
  if (show.watchStatus !== "Paused" && show.watchStatus !== "Completed") return false;
  return watchCount > 0 && watchCount < show.totalEpisodes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireInteger(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ConversionHalt(`convert.confirm.json: ${where} must be a whole number.`);
  }
  return value;
}

/**
 * Validates `convert.confirm.json`, which is config that gates data loss.
 *
 * It is read as a file by the CLI and as a literal by the test, so the shape is checked in
 * one place either way. A typo in the key that carries the answer would otherwise read as
 * *no answer given* and halt — which is at least safe — or, worse, as an answer with an
 * empty credit list, which writes nothing and says it worked.
 */
export function parseConfirmFile(raw: unknown): ConfirmFile {
  if (!isPlainObject(raw) || !Array.isArray(raw.confirmations)) {
    throw new ConversionHalt('convert.confirm.json must be an object with a "confirmations" array.');
  }
  for (const key of Object.keys(raw)) {
    // `$comment` is the only extra key, because JSON has no comments and this file has to
    // explain itself to whoever opens it at cutover.
    if (key !== "confirmations" && key !== "$comment") {
      throw new ConversionHalt(`convert.confirm.json has an unexpected field "${key}".`);
    }
  }

  const confirmations = raw.confirmations.map((entry, index): Confirmation => {
    const where = `confirmations[${index}]`;
    if (!isPlainObject(entry)) {
      throw new ConversionHalt(`convert.confirm.json: ${where} must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!["tmdb_id", "title", "reason", "credit"].includes(key)) {
        throw new ConversionHalt(`convert.confirm.json: ${where} has an unexpected field "${key}".`);
      }
    }
    if (typeof entry.title !== "string" || entry.title.length === 0) {
      throw new ConversionHalt(`convert.confirm.json: ${where}.title must name the show.`);
    }
    if (typeof entry.reason !== "string" || entry.reason.length === 0) {
      throw new ConversionHalt(
        `convert.confirm.json: ${where}.reason must say why this answer is the right one. ` +
          "The answer outlives the person who wrote it.",
      );
    }
    if (!Array.isArray(entry.credit)) {
      throw new ConversionHalt(
        `convert.confirm.json: ${where}.credit must be an array of episodes — empty if the ` +
          "watermark is stale and nothing should be written.",
      );
    }
    return {
      tmdbId: requireInteger(entry.tmdb_id, `${where}.tmdb_id`),
      title: entry.title,
      reason: entry.reason,
      credit: entry.credit.map((coordinate, at): EpisodeCoordinate => {
        if (!isPlainObject(coordinate)) {
          throw new ConversionHalt(
            `convert.confirm.json: ${where}.credit[${at}] must be { "season": n, "episode": n }.`,
          );
        }
        return {
          season: requireInteger(coordinate.season, `${where}.credit[${at}].season`),
          episode: requireInteger(coordinate.episode, `${where}.credit[${at}].episode`),
        };
      }),
    };
  });

  return { confirmations };
}

function parseConfirmations(confirmations: ConfirmFile): ReadonlyMap<number, Confirmation> {
  const byTmdbId = new Map<number, Confirmation>();
  for (const confirmation of confirmations.confirmations) {
    if (byTmdbId.has(confirmation.tmdbId)) {
      throw new ConversionHalt(
        `convert.confirm.json names tmdb ${confirmation.tmdbId} twice. ` +
          "Which answer applies is not something this conversion decides, so nothing is converted.",
      );
    }
    byTmdbId.set(confirmation.tmdbId, confirmation);
  }
  return byTmdbId;
}

function describeStraggler(straggler: StragglerReport): string {
  return (
    `  ${straggler.name} (tmdb ${straggler.tmdbId}) — watched through ${straggler.watchedThrough} ` +
    `of ${straggler.totalEpisodes} episodes; ${straggler.markedWatched} episodes are marked ` +
    `watched and ${straggler.markedNotWatched} marked not watched, leaving ` +
    `${straggler.unaccountedFor} watch(es) with no episode named.`
  );
}

/**
 * The mapping. Parsed export rows in, the native file out.
 *
 * @throws {ConversionHalt} when the export needs a human — an ambiguous watermark with no
 * answer in `convert.confirm.json`, a stale answer for a show that no longer needs one, a
 * coordinate TMDB does not list, or a film, which nothing maps yet.
 */
export function mapToNativeImport(
  exported: TvtrackerExport,
  options: ConversionOptions,
): ConversionResult {
  const { accountId, episodeIndex } = options;

  const films = exported.movies.filter((movie) => movie.userId === accountId);
  if (films.length > 0) {
    throw new ConversionHalt(
      `The export holds ${films.length} film(s) — ${films.map((film) => film.title).join(", ")} — ` +
        "and this conversion maps shows only. It was written when `public.movies` held zero " +
        "rows; dropping a film without saying so is the failure it exists to prevent, so " +
        "nothing is converted.",
    );
  }

  const shows = exported.shows.filter((show) => show.userId === accountId);
  const overrides = exported.overrides.filter((row) => row.userId === accountId);

  const overridesByShow = new Map<string, TvtrackerOverrideRow[]>();
  for (const row of overrides) {
    const rows = overridesByShow.get(row.showId);
    if (rows === undefined) overridesByShow.set(row.showId, [row]);
    else rows.push(row);
  }

  const confirmations = parseConfirmations(options.confirmations);
  const confirmationsUsed = new Set<number>();

  const titles: { tmdb_id: number; kind: "show"; abandoned: boolean }[] = [];
  const watches: {
    tmdb_id: number;
    tmdb_episode_id: number;
    watched_at: string | null;
    key: string;
  }[] = [];

  const unanswered: StragglerReport[] = [];
  const wholeShowExpansions: StragglerReport[] = [];
  const confirmedExpansions: StragglerReport[] = [];

  let overridesMarkedWatched = 0;
  let overridesMarkedNotWatched = 0;
  let titlesWithNoWatches = 0;
  let titlesAbandoned = 0;
  let watchesDated = 0;

  // Sorted so the file is byte-identical run to run, whatever order the dump held.
  const orderedShows = [...shows].sort((a, b) => a.tmdbId - b.tmdbId);

  for (const show of orderedShows) {
    const rows = overridesByShow.get(show.id) ?? [];
    const watchedRows = rows.filter((row) => row.watched);
    const notWatchedRows = rows.filter((row) => !row.watched);
    overridesMarkedWatched += watchedRows.length;
    overridesMarkedNotWatched += notWatchedRows.length;

    const straggler: StragglerReport = {
      tmdbId: show.tmdbId,
      name: show.name,
      watchedThrough: show.watchedThrough,
      totalEpisodes: show.totalEpisodes,
      markedWatched: watchedRows.length,
      markedNotWatched: notWatchedRows.length,
      unaccountedFor: show.watchedThrough - notWatchedRows.length - watchedRows.length,
    };

    let watched: readonly IndexedEpisode[];

    if (straggler.unaccountedFor <= 0) {
      // The override rows are the whole truth. 9-1-1 lands here: its watermark reads one
      // higher than its 133 watched rows only because an episode below the watermark is
      // explicitly marked not watched, so the apparent shortfall is an artifact.
      const episodes = watchedRows.length > 0 ? episodesFor(episodeIndex, show) : [];
      watched = watchedRows.map((row) =>
        resolveCoordinate(
          episodes,
          show,
          { season: row.seasonNumber, episode: row.episodeNumber },
          "records a watch of",
        ),
      );
    } else if (show.watchedThrough === show.totalEpisodes && show.totalEpisodes > 0) {
      watched = expandWholeShow(show, episodesFor(episodeIndex, show), notWatchedRows);
      wholeShowExpansions.push(straggler);
    } else {
      const confirmation = confirmations.get(show.tmdbId);
      if (confirmation === undefined) {
        unanswered.push(straggler);
        continue;
      }
      confirmationsUsed.add(show.tmdbId);
      confirmedExpansions.push(straggler);

      const episodes = episodesFor(episodeIndex, show);
      const named = new Set(
        watchedRows.map((row) => coordinateKey(row.seasonNumber, row.episodeNumber)),
      );
      const credited = confirmation.credit.map((coordinate) => {
        const key = coordinateKey(coordinate.season, coordinate.episode);
        if (named.has(key)) {
          throw new ConversionHalt(
            `convert.confirm.json credits ${show.name} (tmdb ${show.tmdbId}) with ` +
              `${describeCoordinate(coordinate)}, which the export already records as watched. ` +
              "A watch counted twice is not something this conversion resolves, so nothing is converted.",
          );
        }
        named.add(key);
        return resolveCoordinate(episodes, show, coordinate, "is credited by convert.confirm.json with");
      });

      watched = [
        ...watchedRows.map((row) =>
          resolveCoordinate(
            episodes,
            show,
            { season: row.seasonNumber, episode: row.episodeNumber },
            "records a watch of",
          ),
        ),
        ...credited,
      ];
    }

    const abandoned = isAbandoned(show, watched.length);
    if (abandoned) titlesAbandoned += 1;
    if (watched.length === 0) titlesWithNoWatches += 1;

    // A title with no watches is still a title. 22 of them are exactly that, and dropping
    // them would lose the watchlist rather than lose history quietly.
    titles.push({ tmdb_id: show.tmdbId, kind: "show", abandoned });

    // 19 titles carry a real `last_watched_at` — 8 distinct days between 2026-07-21 and
    // 2026-08-15, and none of them equals that row's `added_at` or `updated_at`, which is
    // what separates them from the import stamps every other title carries. The date lands
    // on the title's furthest-watched episode; a title with no watches has nowhere to put
    // one, and no watch is invented to hold it.
    const datedEpisode = show.lastWatchedAt === null ? undefined : furthestWatched(watched);
    const datedAt =
      show.lastWatchedAt !== null && datedEpisode !== undefined
        ? isoInstant(show.lastWatchedAt)
        : null;
    if (datedAt !== null) watchesDated += 1;

    const ordered = [...watched].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode,
    );
    for (const episode of ordered) {
      watches.push({
        tmdb_id: show.tmdbId,
        tmdb_episode_id: episode.tmdbEpisodeId,
        // Nothing synthesises a date. `null` means the watch happened and the export does
        // not know when, which is true of all but 19 of them.
        watched_at:
          datedEpisode !== undefined && episode.tmdbEpisodeId === datedEpisode.tmdbEpisodeId
            ? datedAt
            : null,
        // Always `:1`. There are no rewatches in this library to express, and the suffix
        // exists so a future file could express one without a format change.
        key: `${episode.tmdbEpisodeId}:1`,
      });
    }
  }

  if (unanswered.length > 0) {
    throw new ConversionHalt(
      `The conversion stopped: ${unanswered.length} show(s) claim watches that no episode row ` +
        "names, and convert.confirm.json does not answer for them.\n\n" +
        unanswered.map(describeStraggler).join("\n") +
        "\n\nThe export does not record which episodes these were, and this conversion does not " +
        "guess. Add an entry for each to scripts/convert-tvtracker/convert.confirm.json naming " +
        "the episodes to credit — an empty credit list is a valid answer, and records that the " +
        "watermark is stale and nothing should be written.",
    );
  }

  const stale = [...confirmations.keys()].filter((tmdbId) => !confirmationsUsed.has(tmdbId));
  if (stale.length > 0) {
    throw new ConversionHalt(
      "convert.confirm.json answers for show(s) this export does not ask about: " +
        stale.map((tmdbId) => `tmdb ${tmdbId}`).join(", ") +
        ". `tvtracker` is re-exported at cutover, so an answer left behind for a show that no " +
        "longer needs one would be inherited without anyone looking at it. Remove it, or check " +
        "why the show stopped being ambiguous. Nothing is converted.",
    );
  }

  const json: NativeImportJson = { source: IMPORT_SOURCE, titles, watches };

  return {
    json,
    // Validated by the app's own reader, so this script cannot write a file import would
    // refuse — including the borrowed-metadata refusal, which is the check that matters
    // most here and the one a hand-rolled assertion would drift from.
    file: parseNativeImportFile(json),
    accounting: {
      titlesInExport: exported.shows.length,
      titlesForOtherAccounts: exported.shows.length - shows.length,
      titlesWritten: titles.length,
      titlesWithNoWatches,
      titlesAbandoned,
      overridesRead: overrides.length,
      overridesMarkedWatched,
      overridesMarkedNotWatched,
      watchesWritten: watches.length,
      watchesDated,
      wholeShowExpansions,
      confirmedExpansions,
      dropped: [
        `${exported.shows.length - shows.length} title(s) belonging to another account`,
        `${exported.overrides.length - overrides.length} episode row(s) belonging to another account`,
        `${shows.filter((show) => show.isFavourite).length} favourite(s)`,
        `${shows.filter((show) => show.isPinned).length} pin(s)`,
        "every added_at — all of them are v2-import stamps from a 9-day window, not when a title was found",
        "every borrowed field — name, overview, poster_path, backdrop_path, first_air_date, tmdb_status, episode_runtime, legacy",
      ],
    },
  };
}

/**
 * Dump text in, the native file's contents out. The whole conversion, minus the IO.
 *
 * @throws {ConversionHalt} see `mapToNativeImport`.
 */
export function convertTvtrackerExport(
  dumpSql: string,
  options: ConversionOptions,
): ConversionResult {
  return mapToNativeImport(parseTvtrackerDump(dumpSql), options);
}
