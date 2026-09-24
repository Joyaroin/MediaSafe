import { parseNativeImportFile, type NativeImportFile } from "@/import/native-format";

/**
 * `tvtracker`'s export → MediaSafe's native import file. Pure (issue #71).
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
 * No filesystem, no network, no TMDB, no clock, no randomness. Test 1 of the four —
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

/**
 * An acknowledgement that a show's TV Time numbering cannot be reconciled with TMDB's, and
 * that the watches it cannot place are dropped.
 *
 * **`drop` is the exact count, and that is the whole point.** TV Time split seasons where
 * TMDB does not — its Hunter x Hunter *season 2* is the back half of TMDB's single
 * 148-episode season — and no rule places those without inventing which episode each watch
 * was. Naming the number means a re-export with a different number stops the script rather
 * than inheriting an answer nobody looked at, exactly as the watermark gate does.
 */
export interface UnplaceableAcceptance {
  readonly tmdbId: number;
  readonly title: string;
  readonly reason: string;
  readonly drop: number;
}

export interface ConfirmFile {
  readonly confirmations: readonly Confirmation[];
  readonly unplaceable: readonly UnplaceableAcceptance[];
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
  /** Watches beyond the first for one episode — a rewatch, keyed `:2` and up. */
  readonly rewatches: number;
  /**
   * Rows TV Time recorded that TMDB lists as half of another episode, on shows that hold
   * every episode TMDB lists anyway. Dropped, because the watch is already there.
   */
  readonly twoPartDuplicates: number;
  /** Watches dropped because TV Time's numbering cannot be reconciled, accepted by name. */
  readonly unplaceableDropped: number;
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

/** An override row's `(season, episode)`, which is the only part of it that maps. */
const coordinateOf = (row: TvtrackerOverrideRow): EpisodeCoordinate => ({
  season: row.seasonNumber,
  episode: row.episodeNumber,
});

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
 * *further along* a show than season 6, and specials are kept out of every
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

/** One `(season, episode)` the export names and TMDB does not list. */
export interface UnresolvedCoordinate {
  readonly tmdbId: number;
  readonly name: string;
  readonly season: number;
  readonly episode: number;
  readonly watched: boolean;
}

/**
 * Resolve one `(season, episode)` coordinate, recording a miss rather than throwing.
 *
 * **Collected, not thrown, and that is deliberate.** A conversion that dies on the first
 * bad coordinate tells a person one thing, and there are 45 shows' worth of them in this
 * export — they would fix one, re-run two minutes of TMDB requests, and be told the next.
 * The run still halts and still writes nothing; it just says everything it found first.
 */
function resolveCoordinate(
  episodes: readonly IndexedEpisode[],
  show: TvtrackerShowRow,
  coordinate: EpisodeCoordinate,
  watched: boolean,
  misses: UnresolvedCoordinate[],
): IndexedEpisode | undefined {
  const found = episodes.find(
    (episode) => episode.season === coordinate.season && episode.episode === coordinate.episode,
  );
  if (found === undefined) {
    misses.push({
      tmdbId: show.tmdbId,
      name: show.name,
      season: coordinate.season,
      episode: coordinate.episode,
      watched,
    });
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
  allEpisodes: readonly IndexedEpisode[],
  notWatched: readonly TvtrackerOverrideRow[],
  misses: UnresolvedCoordinate[],
): readonly IndexedEpisode[] {
  /**
   * **Regular seasons only.** `tvtracker`'s `total_episodes` counts season 1 upwards and
   * never the specials — measured, not assumed: it equals TMDB's regular-episode count for
   * **455 of the 462** titles in this export, and equals TMDB's *total* for almost none of
   * them. Schitt's Creek is the case that makes it obvious: 79 episodes and 163 season-0
   * clips, so expanding over everything TMDB lists would write 242 watches for a show the
   * export says has 79.
   *
   * It is also the right reading of the fact. A watermark that says *watched right through*
   * is a claim about the programme, not about 163 behind-the-scenes featurettes, and
   * specials are kept out of every derived state for the same reason. A special
   * that really was watched has an override row of its own, and 28 of them do.
   */
  const episodes = allEpisodes.filter((episode) => episode.season >= 1);

  if (episodes.length !== show.totalEpisodes) {
    throw new ConversionHalt(
      `${show.name} (tmdb ${show.tmdbId}) was watched right through ${show.totalEpisodes} ` +
        `episodes, but TMDB lists ${episodes.length} outside its specials. Expanding the ` +
        "watermark would write a number of watches the export does not support, so nothing " +
        "is converted.",
    );
  }

  // Resolved rather than merely keyed, so a not-watched row naming an episode TMDB does
  // not list halts instead of silently subtracting nothing — which would write one watch
  // too many and look exactly like a correct run.
  const excluded = new Set(
    notWatched
      .map((row) => resolveCoordinate(episodes, show, coordinateOf(row), false, misses))
      .filter((episode) => episode !== undefined)
      .map((episode) => coordinateKey(episode.season, episode.episode)),
  );

  return episodes.filter((episode) => !excluded.has(coordinateKey(episode.season, episode.episode)));
}

/**
 * `abandoned` on a title: `tvtracker`'s hand-set judgement, carried and not invented.
 *
 * `Paused` is `abandoned` spelled `tvtracker`'s way — the *Avoid* line for
 * **Abandoned** lists *paused* first — and #25 extended it to `Completed` shows that are
 * not actually finished, which is the same judgement written in the other of the two boxes
 * `tvtracker` offered. Both are *"I have stopped watching this"*.
 *
 * The third clause is the one that is easy to leave out and changes the count: **a title
 * with no watches at all is on the watchlist, not abandoned.** You cannot abandon
 * something you never started, and 2 `Paused` titles in the export have zero watches.
 *
 * On the day-one export this is 65 `Paused` + 90 short `Completed` = **155**, and the rest
 * of the arrival split falls out of the same numbers: 62 watching, 22 watchlist,
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
    if (key !== "confirmations" && key !== "unplaceable" && key !== "$comment") {
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

  const unplaceable = (Array.isArray(raw.unplaceable) ? raw.unplaceable : []).map(
    (entry, index): UnplaceableAcceptance => {
      const where = `unplaceable[${index}]`;
      if (!isPlainObject(entry)) {
        throw new ConversionHalt(`convert.confirm.json: ${where} must be an object.`);
      }
      for (const key of Object.keys(entry)) {
        if (!["tmdb_id", "title", "reason", "drop"].includes(key)) {
          throw new ConversionHalt(`convert.confirm.json: ${where} has an unexpected field "${key}".`);
        }
      }
      if (typeof entry.title !== "string" || entry.title.length === 0) {
        throw new ConversionHalt(`convert.confirm.json: ${where}.title must name the show.`);
      }
      if (typeof entry.reason !== "string" || entry.reason.length === 0) {
        throw new ConversionHalt(
          `convert.confirm.json: ${where}.reason must say why these watches cannot be placed.`,
        );
      }
      return {
        tmdbId: requireInteger(entry.tmdb_id, `${where}.tmdb_id`),
        title: entry.title,
        reason: entry.reason,
        drop: requireInteger(entry.drop, `${where}.drop`),
      };
    },
  );

  return { confirmations, unplaceable };
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

  const misses: UnresolvedCoordinate[] = [];
  const unanswered: StragglerReport[] = [];
  const wholeShowExpansions: StragglerReport[] = [];
  const confirmedExpansions: StragglerReport[] = [];

  let overridesMarkedWatched = 0;
  let overridesMarkedNotWatched = 0;
  let titlesWithNoWatches = 0;
  let twoPartDuplicates = 0;
  let rewatches = 0;
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

    /**
     * Every episode the export records a watch of, in `tvtracker`'s own numbering — which
     * is TV Time's.
     *
     * Two sources, and they are two eras rather than two opinions. `episode_overrides` is
     * what the v3 tables kept; `legacy`'s dates and watch events are what the v2 blob kept,
     * and they are the only surviving record of *when* and *how often*. A title watched
     * inside `tvtracker` has events and no dates; one imported from TV Time has dates and
     * no events. Schitt's Creek is the case that needs both: one override row and 79
     * recorded events.
     *
     * An episode explicitly marked *not* watched is removed last, so the newer v3
     * judgement wins over an older date — un-watching something must not be undone by the
     * blob it was imported from.
     */
    const unwatched = new Set(
      notWatchedRows.map((row) => coordinateKey(row.seasonNumber, row.episodeNumber)),
    );
    const recorded = new Map<string, EpisodeCoordinate>();
    for (const row of watchedRows) {
      recorded.set(coordinateKey(row.seasonNumber, row.episodeNumber), coordinateOf(row));
    }
    for (const episode of show.history) {
      if (episode.watchedAt.length === 0) continue;
      recorded.set(coordinateKey(episode.season, episode.episode), {
        season: episode.season,
        episode: episode.episode,
      });
    }
    for (const key of unwatched) recorded.delete(key);

    const straggler: StragglerReport = {
      tmdbId: show.tmdbId,
      name: show.name,
      watchedThrough: show.watchedThrough,
      totalEpisodes: show.totalEpisodes,
      markedWatched: recorded.size,
      markedNotWatched: notWatchedRows.length,
      unaccountedFor: show.watchedThrough - notWatchedRows.length - recorded.size,
    };

    const allEpisodes = recorded.size > 0 || straggler.unaccountedFor > 0
      ? episodesFor(episodeIndex, show)
      : [];
    const regularEpisodes = allEpisodes.filter((episode) => episode.season >= 1);

    /**
     * **Watched right through, as counted by the export itself.**
     *
     * When as many episodes are recorded as the show has, every episode was watched, and
     * that is true however the two catalogues number their seasons. It is the one rule that
     * survives the TV Time/TMDB divergence without inferring anything: Alexa & Katie has 39
     * recorded and 39 episodes, so all 39 are watched, even though TV Time called the last
     * eight *season 3* and TMDB calls them *season 4*.
     *
     * Without it those eight would be unplaceable and the show would read *abandoned* —
     * which is how four shows that were finished came to look abandoned before this rule
     * existed.
     */
    const watchedRightThrough =
      recorded.size >= show.totalEpisodes &&
      show.totalEpisodes > 0 &&
      regularEpisodes.length === show.totalEpisodes;

    let watched: readonly IndexedEpisode[];

    if (watchedRightThrough) {
      watched = regularEpisodes;
    } else if (straggler.unaccountedFor <= 0) {
      // The recorded episodes are the whole truth. 9-1-1 lands here: its watermark reads
      // one higher than its rows only because an episode below it is explicitly marked not
      // watched, so the apparent shortfall is an artifact.
      watched = [...recorded.values()]
        .map((coordinate) => resolveCoordinate(allEpisodes, show, coordinate, true, misses))
        .filter((episode) => episode !== undefined);
    } else if (show.watchedThrough === show.totalEpisodes && show.totalEpisodes > 0) {
      watched = expandWholeShow(show, allEpisodes, notWatchedRows, misses);
      wholeShowExpansions.push(straggler);
    } else {
      const confirmation = confirmations.get(show.tmdbId);
      if (confirmation === undefined) {
        unanswered.push(straggler);
        continue;
      }
      confirmationsUsed.add(show.tmdbId);
      confirmedExpansions.push(straggler);

      const named = new Set(recorded.keys());
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
        return resolveCoordinate(allEpisodes, show, coordinate, true, misses);
      });

      watched = [
        ...[...recorded.values()]
          .map((coordinate) => resolveCoordinate(allEpisodes, show, coordinate, true, misses))
          .filter((episode) => episode !== undefined),
        ...credited.filter((episode) => episode !== undefined),
      ];
    }

    /**
     * **A coordinate that did not resolve, on a show that is complete anyway, is a
     * two-part episode — not a lost watch.**
     *
     * TV Time split some episodes that TMDB lists as one: The Office has 195 recorded
     * against TMDB's 186, Friends 236 against 228. Every TMDB episode of those shows
     * already carries a watch, so the leftovers have nowhere to land and nothing to add.
     * Dropping them loses nothing, and it is provable rather than assumed — the test is
     * that the show still holds every episode TMDB lists.
     */
    const distinct = new Set(watched.map((episode) => episode.tmdbEpisodeId));
    const mine = misses.filter((miss) => miss.tmdbId === show.tmdbId && miss.watched);
    // `regularEpisodes.length === show.totalEpisodes` is the guard that keeps this honest:
    // without it, a TMDB response that came back short would look like a complete show and
    // every unplaceable watch on it would be silently dropped as a two-parter.
    if (
      mine.length > 0 &&
      regularEpisodes.length > 0 &&
      regularEpisodes.length === show.totalEpisodes &&
      distinct.size >= regularEpisodes.length
    ) {
      for (const miss of mine) misses.splice(misses.indexOf(miss), 1);
      twoPartDuplicates += mine.length;
    }

    const abandoned = isAbandoned(show, distinct.size);
    if (abandoned) titlesAbandoned += 1;
    if (distinct.size === 0) titlesWithNoWatches += 1;

    // A title with no watches is still a title. Dropping them would lose the watchlist
    // rather than lose history quietly.
    titles.push({ tmdb_id: show.tmdbId, kind: "show", abandoned });

    // The dates, keyed by the coordinate the export recorded them under.
    const datesFor = new Map<string, readonly string[]>();
    for (const episode of show.history) {
      if (episode.watchedAt.length > 0) {
        datesFor.set(coordinateKey(episode.season, episode.episode), episode.watchedAt);
      }
    }

    const ordered = [...watched].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode,
    );

    let datedHere = 0;
    const seen = new Set<number>();
    for (const episode of ordered) {
      if (seen.has(episode.tmdbEpisodeId)) continue;
      seen.add(episode.tmdbEpisodeId);

      const dates = datesFor.get(coordinateKey(episode.season, episode.episode)) ?? [];
      if (dates.length === 0) {
        // Watched, and the export does not know when. Nothing synthesises a date.
        watches.push({
          tmdb_id: show.tmdbId,
          tmdb_episode_id: episode.tmdbEpisodeId,
          watched_at: null,
          key: `${episode.tmdbEpisodeId}:1`,
        });
        continue;
      }

      // One watch per recorded date. A second date is a rewatch, and `:2` is how the
      // format has always spelled one — #16 reserved the suffix for exactly this and
      // believed it would never be used.
      dates.forEach((at, index) => {
        watches.push({
          tmdb_id: show.tmdbId,
          tmdb_episode_id: episode.tmdbEpisodeId,
          watched_at: at,
          key: `${episode.tmdbEpisodeId}:${index + 1}`,
        });
        datedHere += 1;
        if (index > 0) rewatches += 1;
      });
    }
    watchesDated += datedHere;

    /**
     * The old fallback, kept for the titles the blob has nothing for.
     *
     * `shows.last_watched_at` is a real timestamp on 19 titles, and before `legacy` was
     * read it was the only one this conversion had. It still is for a title whose blob
     * carries no dates, so it lands on the furthest-watched episode there — and nowhere
     * else, because a per-episode date is strictly better evidence than a per-show one.
     */
    if (datedHere === 0 && show.lastWatchedAt !== null) {
      const furthest = furthestWatched(ordered);
      if (furthest !== undefined) {
        const at = isoInstant(show.lastWatchedAt);
        const index = watches.findIndex(
          (watch) =>
            watch.tmdb_id === show.tmdbId && watch.tmdb_episode_id === furthest.tmdbEpisodeId,
        );
        if (index >= 0) {
          watches[index] = { ...watches[index], watched_at: at };
          watchesDated += 1;
        }
      }
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

  /**
   * The residual, and who decides it.
   *
   * What is left here cannot be placed by any rule that does not invent an answer: TV Time
   * numbered these shows' seasons in a way TMDB does not, and the export holds no episode
   * id to fall back on. `convert.confirm.json` is where a person accepts that, one show at
   * a time, naming the count — so a re-export that changes the count stops the script
   * instead of inheriting the acceptance unread.
   */
  const accepted = new Map(options.confirmations.unplaceable.map((entry) => [entry.tmdbId, entry]));
  const acceptedUsed = new Set<number>();
  let unplaceableDropped = 0;

  const unresolvedWatches = misses.filter((miss) => miss.watched).filter((miss) => {
    const entry = accepted.get(miss.tmdbId);
    if (entry === undefined) return true;
    acceptedUsed.add(miss.tmdbId);
    return false;
  });

  for (const [tmdbId, entry] of accepted) {
    const found = misses.filter((miss) => miss.watched && miss.tmdbId === tmdbId).length;
    if (found !== entry.drop) {
      throw new ConversionHalt(
        `convert.confirm.json accepts ${entry.drop} unplaceable watch(es) for ${entry.title} ` +
          `(tmdb ${tmdbId}), and this export has ${found}. The number is named so that a ` +
          "re-export which changes it stops here rather than inheriting an answer nobody " +
          "looked at. Nothing is converted.",
      );
    }
    unplaceableDropped += found;
  }

  if (unresolvedWatches.length > 0) {
    const byShow = new Map<number, UnresolvedCoordinate[]>();
    for (const miss of unresolvedWatches) {
      const forShow = byShow.get(miss.tmdbId);
      if (forShow === undefined) byShow.set(miss.tmdbId, [miss]);
      else forShow.push(miss);
    }

    const shows = [...byShow.values()]
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .map((forShow) => {
        const coordinates = forShow
          .map((miss) => describeCoordinate(miss))
          .sort((a, b) => a.localeCompare(b));
        return `  ${forShow[0].name} (tmdb ${forShow[0].tmdbId}) — ${coordinates.join(", ")}`;
      });

    throw new ConversionHalt(
      `The conversion stopped: ${unresolvedWatches.length} recorded watch(es) across ` +
        `${byShow.size} show(s) name an episode TMDB does not list.\n\n` +
        shows.join("\n") +
        "\n\nThese are watches that really happened — the export records them — but " +
        "`tvtracker` numbered their seasons differently from TMDB, so there is no episode " +
        "to key them to. The native format is keyed by tmdb_episode_id precisely so this " +
        "fails here, in front of a person, rather than silently repointing history. " +
        "Deciding what becomes of them is not this script's call, so nothing is converted.",
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
      rewatches,
      twoPartDuplicates,
      unplaceableDropped,
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
