/**
 * TMDB's responses → the rows MediaSafe mirrors. Pure, and tested
 * (`tests/tmdb-mirror.test.ts`).
 *
 * ── Why this is a function and not four lines inside the add handler ─────────────────
 *
 * `title` and `episode` are **global and unowned** — one row per TMDB id, shared by every
 * account (ADR-0001). So one person adding a show writes rows every other person then
 * reads, and this mapping is shared infrastructure rather than one person's data path.
 * That is the whole argument for the shape: `SPEC.md` §6's "everything else fails loudly
 * and cheaply to an app used daily by its owner" is the reason almost nothing here is
 * tested, and it does not reach a write that lands in somebody else's library.
 *
 * The natural spelling — fetch, then insert, in one handler — cannot be tested without a
 * network and a database, which in practice means it is not tested. Splitting the fetch
 * (`tmdb/catalogue.ts`, deliberately untested) from the mapping (here) is what makes the
 * half that can drift silently the half that is pinned to captured responses.
 *
 * ── The line this file may not cross ─────────────────────────────────────────────────
 *
 * ADR-0001's metadata caching policy divides TMDB's fields in two, and **only the
 * left-hand column exists in this file**:
 *
 * | Mirrored in Postgres | Fetched live, never stored |
 * | --- | --- |
 * | name, kind, release year, poster path | synopsis / overview |
 * | `in_production`, runtime | cast and crew |
 * | every episode's number, name, air date | backdrops and additional images |
 * | | watch providers |
 *
 * Adding a field to the right-hand column's side of that line is not a mapping change. It
 * is a schema change, an ADR amendment, and a migration — in that order.
 *
 * ── Purity, precisely ────────────────────────────────────────────────────────────────
 *
 * No clock, no network, no database, no randomness. In particular nothing here stamps
 * `metadata_refreshed_at`: it is `DEFAULT now()` in Postgres, and reading a clock to
 * produce it would make the output of these functions un-assertable for the sake of a
 * column the database already fills.
 */

/** `title.kind`. TMDB numbers films and shows separately, so it is part of the key. */
export type TitleKind = "film" | "show";

/**
 * TMDB's payloads, declared as narrowly as this file reads them and as loosely as TMDB
 * actually sends them.
 *
 * Every field is optional, and that is not defensiveness for its own sake: TMDB omits
 * `poster_path`, sends `""` for a date it does not have, and sends `null` for a runtime it
 * does not have — all three within one response. Typing them as present would move those
 * three cases from a branch in this file to a crash in production, which is the trade the
 * `?` marks are refusing.
 */
export interface TmdbSearchResultPayload {
  media_type?: string;
  id?: number;
  /** Films. */
  title?: string;
  /** Shows. */
  name?: string;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
}

export interface TmdbSearchPayload {
  page?: number;
  results?: TmdbSearchResultPayload[];
  total_results?: number;
}

export interface TmdbMoviePayload {
  id?: number;
  title?: string;
  release_date?: string | null;
  poster_path?: string | null;
  runtime?: number | null;
}

export interface TmdbShowSeasonPayload {
  season_number?: number;
}

export interface TmdbShowPayload {
  id?: number;
  name?: string;
  first_air_date?: string | null;
  poster_path?: string | null;
  in_production?: boolean;
  seasons?: TmdbShowSeasonPayload[];
}

export interface TmdbEpisodePayload {
  id?: number;
  season_number?: number;
  episode_number?: number;
  name?: string | null;
  air_date?: string | null;
  runtime?: number | null;
}

export interface TmdbSeasonPayload {
  season_number?: number;
  episodes?: TmdbEpisodePayload[];
}

/**
 * One catalogue result, as the search screen renders it.
 *
 * Deliberately the same four borrowed facts a library tile shows, and no more: this is a
 * list, and a synopsis on a list row is the spreadsheet `SPEC.md` §3.4 forbids as much as
 * it is a field ADR-0001 forbids storing.
 */
export interface CatalogueResult {
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
}

/**
 * What identifies a catalogue entry, and what `title` is keyed by:
 * `UNIQUE (kind, tmdb_id)`, because TMDB numbers films and shows separately and the id
 * alone is not unique.
 */
export interface CatalogueKey {
  readonly kind: TitleKind;
  readonly tmdbId: number;
}

/**
 * One catalogue key as a string, for set membership and for React keys.
 *
 * It lives in this file rather than in `db/access.ts`, where the question *is this in the
 * library* is answered, for a mechanical reason worth writing down: the search screen is a
 * client component and needs this to key its rows, and importing it from `db/access.ts`
 * would pull that module — and through it Drizzle and the Postgres driver — into the
 * browser bundle. This file is pure, imports nothing, and is safe on both sides.
 */
export function catalogueKeyOf(key: CatalogueKey): string {
  return `${key.kind}:${key.tmdbId}`;
}

/** One `episode` row, in the order ADR-0001's table declares them. */
export interface EpisodeMirror {
  readonly tmdbEpisodeId: number;
  /** 0 = specials: mirrored and markable, excluded from every derived state. */
  readonly seasonNo: number;
  readonly episodeNo: number;
  readonly name: string | null;
  /** `YYYY-MM-DD`, as TMDB sends it and as Postgres's `date` takes it. */
  readonly airDate: string | null;
  readonly runtimeMins: number | null;
}

/** One `title` row and every `episode` row under it: everything one add writes. */
export interface TitleMirror {
  readonly kind: TitleKind;
  readonly tmdbId: number;
  readonly name: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
  /** Shows only; `null` for films. */
  readonly inProduction: boolean | null;
  /** Films only; `null` for shows. */
  readonly runtimeMins: number | null;
  /** Empty for a film, and for a show TMDB has no episode data for. */
  readonly episodes: readonly EpisodeMirror[];
}

/**
 * `"2011-04-17"` → `2011`; `""`, `null` and anything unparseable → `null`.
 *
 * The empty string is the case that bites: it is how TMDB spells *undated*, and
 * `Number("")` is `0`, so the obvious spelling of this puts the year zero on every title
 * TMDB has not dated.
 */
function releaseYearFrom(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/** `""` → `null`. Postgres's `date` will not take an empty string, and neither will we. */
function dateFrom(date: string | null | undefined): string | null {
  return date ? date : null;
}

/** `""` → `null`, so an unnamed episode is unnamed rather than named nothing. */
function textFrom(value: string | null | undefined): string | null {
  return value ? value : null;
}

function integerFrom(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * Films and shows from one `/search/multi` response, in TMDB's own relevance order.
 *
 * `/search/multi` rather than two calls, because the acceptance criterion is one field
 * returning both kinds and TMDB will rank them against each other better than a merge of
 * two ranked lists would.
 *
 * **People are dropped**, and this is the one thing the endpoint makes easy to get wrong:
 * a person result carries a `known_for` array of films, so a mapping that reached into
 * results rather than reading them would return the same film twice, once un-addable.
 *
 * A film or show result missing an id or a name is dropped rather than thrown, which is
 * the one place this file prefers quiet to loud. The reasoning is the blast radius: a
 * malformed row in a list of twenty is one missing result, and throwing would turn it
 * into a search that failed — which on this screen is a state with its own treatment and
 * would be a lie about what happened. A malformed row on the *add* path is the opposite
 * call, and `titleMirror` below throws.
 */
export function catalogueResults(payload: TmdbSearchPayload): CatalogueResult[] {
  /**
   * Keyed, and TMDB's own relevance order preserved — a `Map` iterates in insertion
   * order, so the first appearance of a title keeps its rank.
   *
   * **One row per `(kind, tmdb_id)`, because that is what the rest of the screen assumes.**
   * `catalogueKeyOf` is the React key for the result list and the key of the
   * already-in-your-library set, so a repeated result would render the same title twice
   * with colliding keys — and pressing *Add* on one of them would leave the other still
   * offering to add what you now have. TMDB is not guaranteed to be free of repeats, and
   * the cost of assuming it is falls on the reader rather than on this function.
   */
  const byKey = new Map<string, CatalogueResult>();

  for (const result of payload.results ?? []) {
    const kind = kindOf(result.media_type);
    if (!kind) continue;

    const tmdbId = integerFrom(result.id);
    const name = kind === "film" ? result.title : result.name;
    if (tmdbId === null || !name) continue;

    const key = catalogueKeyOf({ kind, tmdbId });
    // First wins: the later copy is the lower-ranked one, and TMDB ranked them.
    if (byKey.has(key)) continue;

    byKey.set(key, {
      kind,
      tmdbId,
      name,
      releaseYear: releaseYearFrom(
        kind === "film" ? result.release_date : result.first_air_date,
      ),
      posterPath: textFrom(result.poster_path),
    });
  }

  return [...byKey.values()];
}

function kindOf(mediaType: string | undefined): TitleKind | null {
  if (mediaType === "movie") return "film";
  if (mediaType === "tv") return "show";
  // `person`, and anything TMDB adds later. CONTEXT.md has a word for the two things
  // MediaSafe keeps and no word for a third.
  return null;
}

/**
 * The season numbers to fetch for a show, specials first, in order and without repeats.
 *
 * Season 0 is included: ADR-0001 mirrors specials and lets you mark them, and excludes
 * them only from the derived states — which is `db/views.ts`'s job, done in SQL, and not
 * something to pre-empt by declining to store them.
 */
export function seasonNumbers(show: TmdbShowPayload): number[] {
  const numbers = new Set<number>();
  for (const season of show.seasons ?? []) {
    const number = integerFrom(season.season_number);
    if (number !== null) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

/** The `title` row for a film: no episodes, no `in_production`. */
export function filmMirror(movie: TmdbMoviePayload): TitleMirror {
  return {
    ...identity("film", movie.id, movie.title),
    releaseYear: releaseYearFrom(movie.release_date),
    posterPath: textFrom(movie.poster_path),
    // Shows only. A film carrying it would be a film carrying a column that says nothing
    // about films, and `caught up` versus `finished` turns on that column.
    inProduction: null,
    runtimeMins: integerFrom(movie.runtime),
    episodes: [],
  };
}

/**
 * The `title` row for a show and every `episode` row under it.
 *
 * `seasons` is whatever `/tv/{id}/season/{n}` returned for each of `seasonNumbers()`.
 * **Their order is not read** — they are fetched concurrently, so the order they arrive in
 * is the order the network happened to answer, and a mirror that depended on it would
 * write different rows on different days. The episodes are sorted by `(season, episode)`
 * here, once.
 */
export function showMirror(
  show: TmdbShowPayload,
  seasons: readonly TmdbSeasonPayload[],
): TitleMirror {
  return {
    ...identity("show", show.id, show.name),
    releaseYear: releaseYearFrom(show.first_air_date),
    posterPath: textFrom(show.poster_path),
    inProduction: show.in_production ?? null,
    // Films only. TMDB's `episode_run_time` is a per-episode average of the show and is
    // not the same fact as a film's length, so it does not go in this column.
    runtimeMins: null,
    episodes: episodeMirrors(seasons),
  };
}

/**
 * The three columns that identify a title, or a throw.
 *
 * **Loud, and this is the asymmetry with `catalogueResults`.** `title.name` is `NOT NULL`
 * and the row is global: a placeholder written here is a placeholder every account reads,
 * and nothing later can tell it from a real name. `UNIQUE (kind, tmdb_id)` then makes it
 * the row that any future correct add collides with. A failed add is a toast; a bad
 * global row is somebody else's library, wrong, quietly.
 */
function identity(
  kind: TitleKind,
  id: number | undefined,
  name: string | undefined,
): Pick<TitleMirror, "kind" | "tmdbId" | "name"> {
  const tmdbId = integerFrom(id);
  if (tmdbId === null) {
    throw new Error(
      `TMDB returned a ${kind} with no id. A title row is keyed by (kind, tmdb_id) and is shared by every account, so there is nothing safe to write.`,
    );
  }
  if (!name) {
    throw new Error(
      `TMDB returned ${kind} ${tmdbId} with no name. title.name is NOT NULL and the row is global — a placeholder here is a placeholder every account reads.`,
    );
  }
  return { kind, tmdbId, name };
}

function episodeMirrors(seasons: readonly TmdbSeasonPayload[]): EpisodeMirror[] {
  /**
   * Keyed by `tmdb_episode_id` because the column is `UNIQUE`, and TMDB does list the
   * same episode under two seasons often enough to matter — a duplicate reaching the
   * insert aborts the whole add, and the reader is told their perfectly ordinary show
   * could not be added.
   *
   * Last write wins, which is arbitrary and stated rather than reasoned: the two copies
   * of a duplicated episode differ in `season_number`, and TMDB gives no way to tell
   * which one it means. The nightly refresh is what settles it later.
   */
  const byTmdbId = new Map<number, EpisodeMirror>();

  for (const season of seasons) {
    for (const episode of season.episodes ?? []) {
      const tmdbEpisodeId = integerFrom(episode.id);
      // Dropped rather than thrown: the row is keyed by this id, so there is no row to
      // write, and one missing special must not cost the reader the whole show.
      if (tmdbEpisodeId === null) continue;

      byTmdbId.set(tmdbEpisodeId, {
        tmdbEpisodeId,
        seasonNo: integerFrom(episode.season_number) ?? integerFrom(season.season_number) ?? 0,
        episodeNo: integerFrom(episode.episode_number) ?? 0,
        // Load-bearing, not decorative: CONTEXT.md forbids referring to an episode by
        // number alone, which puts the name on ordinary list screens.
        name: textFrom(episode.name),
        airDate: dateFrom(episode.air_date),
        runtimeMins: integerFrom(episode.runtime),
      });
    }
  }

  return [...byTmdbId.values()].sort(
    (a, b) => a.seasonNo - b.seasonNo || a.episodeNo - b.episodeNo,
  );
}
