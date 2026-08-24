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
 * | name, kind, release year, release date, poster path | synopsis / overview |
 * | `in_production`, runtime | cast and crew |
 * | every episode's number, name, air date, still | backdrops and other images |
 * | one external id — IMDb, else TVDB | watch providers |
 *
 * **The release date and the episode still are the newest entries** (amendment 10), and
 * they fit the dividing line rather than straining it: the rail of next episodes and the
 * Upcoming screen are *list* renders, and the ADR's test is what a 472-row library render
 * needs. Neither costs a request — both arrive in the show, season and film responses
 * this file is already handed. The release date **supersedes nothing**: `release_year`
 * stays, derived from the same payload field by the same function.
 *
 * A backdrop is still a detail-page image and stays on the right.
 *
 * The external id is the other entry that does not fit the dividing line the
 * rest of the table follows — nothing renders it, and nothing reads it at all yet. It is
 * mirrored because TMDB publishes no successor id: a deleted or merged title answers 404
 * and nothing else, so the stored id is the only thing a vanished title can be re-found
 * by. The rest of what TMDB packs into `external_ids` — the social handles, Wikidata —
 * is on the right-hand side of the line like everything else, and stays there.
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
 * `title.external_id` — the catalogue and the id, in one value: `imdb:tt0944947`,
 * `tvdb:121361`.
 *
 * A union rather than a bare `string`, for the reason `TitleKind` is one: the column is
 * `text` with a `CHECK` (`title_external_id_check`), and the type is the half of that pair
 * TypeScript can hold. `externalIdFrom` is the only function that can mint one — every
 * other spelling, including a raw `imdb_id` concatenated in by a later reader, fails to
 * typecheck rather than reaching the database and failing there.
 *
 * The source is in the value because the only thing that will ever read this column hands
 * it back to TMDB's `/find/{id}?external_source=`, which takes the source as a required
 * parameter. Recovering it from the id's shape at read time would work and would be a
 * convention; this is the same fact, checked.
 */
export type ExternalId = `imdb:tt${string}` | `tvdb:${number}`;

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
  /**
   * `/movie/{id}` carries this at the top level, so a film costs no extra request. Shows
   * do not — see `TmdbShowPayload.external_ids`.
   */
  imdb_id?: string | null;
}

/**
 * TMDB's `external_ids` object: the ids somebody else assigned this title.
 *
 * Declared as narrowly as `externalIdFrom` reads it. TMDB sends several more —
 * `wikidata_id`, `facebook_id`, `instagram_id`, `twitter_id`, `tvrage_id` — and none of
 * them is a catalogue MediaSafe could look a title up in, which is the only thing this
 * object is here for. Leaving them undeclared is how that stays true.
 */
export interface TmdbExternalIdsPayload {
  imdb_id?: string | null;
  tvdb_id?: number | null;
}

/**
 * The `append_to_response` a `/tv/{id}` request must carry for `showMirror` to have an
 * external id to mirror.
 *
 * A show fetched without it parses perfectly and mirrors `null`, which is the failure
 * worth naming: it is silent, it is indistinguishable from a show TMDB genuinely has no
 * external id for, and — because the upsert overwrites this column like every other
 * borrowed one — a *refresh* that forgets the append does not merely fail to fill the
 * column in, it clears it. The constant lives here, beside the payload type it fills in,
 * so that no call site has to remember the string.
 *
 * **Three call sites fetch `/tv/{id}` and hand it to `showMirror`; two of them need this
 * and one does not.**
 *
 *  - `tmdb/catalogue.ts` — the search add and the import screen. Carries it.
 *  - `scripts/db-seed.ts` — its own thin client, because `catalogue.ts` is `server-only`
 *    and would throw under `tsx`. Carries it.
 *  - `scripts/convert-tvtracker/resolve.ts` — reads `showMirror(...).episodes` and throws
 *    the title away, so it writes no `title` row and has no external id to get wrong. It
 *    is the one that may skip this, and only for exactly that reason: **the moment it
 *    keeps anything but the episodes, it needs the append.**
 *
 * `append_to_response` rather than a second `/tv/{id}/external_ids` call, and this is not
 * the trade `tmdb/catalogue.ts` refuses for the live fields. That refusal buys *separate
 * failures* — a synopsis that renders while credits are 500ing — and an add has no such
 * granularity to buy: one failed season already fails the whole add.
 */
export const SHOW_EXTERNAL_IDS_APPEND = "external_ids";

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
  /** Present only when the request carried `SHOW_EXTERNAL_IDS_APPEND`. */
  external_ids?: TmdbExternalIdsPayload | null;
}

export interface TmdbEpisodePayload {
  id?: number;
  season_number?: number;
  episode_number?: number;
  name?: string | null;
  air_date?: string | null;
  runtime?: number | null;
  /**
   * The episode's own image. Mirrored since amendment 10 — `null` on most specials and
   * on anything unaired, which is exactly the case the rail renders a placeholder for.
   */
  still_path?: string | null;
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
 * The same key, out of two values nobody has checked — a URL segment, a Server Action's
 * arguments, anything else that arrives as *whatever the caller sent*.
 *
 * ── Why it is one function rather than a check at each door ───────────────────────────
 *
 * Every door still calls it: `search/actions.ts`'s add, `titles/actions.ts`'s add, and
 * the unowned title route, which parses its two segments through this before either read
 * runs. A Server Action is a POST endpoint anyone with a session can call with any
 * arguments, and a route's params are whatever was typed, so validating at the boundary is
 * not a formality — both values reach `title_kind_check` and an `integer` column. What
 * those three call sites do **not** each need is their own copy of the predicate: three
 * copies is three places for one of them to start accepting `0`, or to read `"12abc"` as
 * `12`, while the other two do not.
 *
 * ── `unknown`, and `Number` rather than `parseInt` ────────────────────────────────────
 *
 * `unknown` because a value the type system has been told about is exactly the value this
 * exists to distrust — a Server Action's declared parameter types are erased at the
 * network boundary. `Number` and not `parseInt`, because `parseInt("12abc")` is `12` and a
 * segment that is not a number must not be read as the number it happens to start with.
 * `Number(null)` and `Number("")` are both `0`, which `<= 0` rejects.
 *
 * ── It accepts both spellings of the id, and that is a deliberate widening ────────────
 *
 * A TMDB id reaches this application as a URL segment (`"1399"`) and as an action's
 * argument (`1399`), and both are the same catalogue key, so this converts rather than
 * insisting on one. **That is a real change to `search/actions.ts`**, which is worth
 * saying rather than filing under refactoring: its inlined `Number.isInteger(tmdbId)`
 * threw for the string `"550"` and this does not. Nothing is loosened about what reaches
 * the database — every value that gets past here is the same positive integer it would
 * have had to be before — and the alternative was either a second predicate for the
 * string case or leaving three copies of one check, both of which cost more than the
 * spelling this now tolerates.
 *
 * It throws rather than returning a null key: every caller is inside something that
 * already turns a throw into the right treatment — a Server Action's `catch` and its
 * reference id, or the route's own `error.tsx` — and a key that could be absent would put
 * a second, quieter failure path beside the one that already works.
 */
export function catalogueKeyFrom(kind: unknown, tmdbId: unknown): CatalogueKey {
  if (kind !== "film" && kind !== "show") {
    throw new Error(`A catalogue key was asked for kind ${JSON.stringify(kind)}.`);
  }

  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`A catalogue key was asked for TMDB id ${JSON.stringify(tmdbId)}.`);
  }

  return { kind, tmdbId: id };
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
  /**
   * The episode's own image, as a TMDB CDN path (`/wrGWe….jpg`) exactly like
   * `posterPath` — no blob is stored, and no size is baked in here.
   *
   * **Amendment 10 moved this across ADR-0001's line**, on the ADR's own test: the rail
   * of next episodes is a list render, and fetching a still per card is one catalogue
   * request per card. It arrives in the season response the mirror already fetches.
   *
   * `null` is ordinary, not exceptional — unaired episodes and most specials have none.
   */
  readonly stillPath: string | null;
}

/** One `title` row and every `episode` row under it: everything one add writes. */
export interface TitleMirror {
  readonly kind: TitleKind;
  readonly tmdbId: number;
  /**
   * `imdb:tt0944947`, `tvdb:121361`, or `null` where TMDB has neither.
   *
   * The source is part of the value, not a second column: the only thing that will ever
   * read this has to hand it back to TMDB's `/find/{id}?external_source=` and cannot
   * guess which of the two it holds. `title_external_id_check` in `db/tables.ts` holds
   * the same two spellings at the database.
   *
   * **Absent rather than invented.** Nothing here derives one, searches for one, or
   * carries one over from a previous mirror of the same title — a wrong external id is a
   * wrong id on a global row, and the thing that will read it repoints titles.
   */
  readonly externalId: ExternalId | null;
  readonly name: string;
  readonly releaseYear: number | null;
  /**
   * `YYYY-MM-DD` — a film's release date, a show's first air date.
   *
   * **Amendment 10, and it supersedes nothing.** `releaseYear` above is still derived
   * from the same payload field by the same function and is still what the library grid
   * and the search results print; this is the whole date, for Upcoming — a list render
   * that has to *order* by it, which a year cannot do.
   */
  readonly releaseDate: string | null;
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

/**
 * `""` → `null`, so an unnamed episode is unnamed rather than named nothing.
 *
 * Exported: `tmdb/live-facts.ts` parses the same inconsistently-empty TMDB strings for
 * the fields this file may not mirror (`overview`, cast and crew names, provider names),
 * and this is the one normalisation both files need.
 */
export function textFrom(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** Exported for the same reason `textFrom` is — see its comment. */
export function integerFrom(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** IMDb title ids, and only title ids — `nm…` is a person and `co…` is a company. */
const IMDB_TITLE_ID = /^tt\d+$/;

/**
 * A type predicate rather than a bare `.test()`, so that the `imdb:` half of `ExternalId`
 * is reached by narrowing instead of by assertion. Nothing here is cast.
 */
function isImdbTitleId(value: string): value is `tt${string}` {
  return IMDB_TITLE_ID.test(value);
}

/**
 * `title.external_id`: IMDb where TMDB has one, TVDB otherwise, `null` where it has
 * neither.
 *
 * **Anything that does not match is `null`, not stored.** TMDB sends `""` for an id it
 * does not have as readily as it omits the field, and sends `0` for an unset `tvdb_id`.
 * The column exists so that a 404'd title can be looked up by this value; a value no
 * lookup can be made from is not a weaker version of that, it is a row that *claims* a
 * handle exists — and the reader of that claim repoints a global title row.
 *
 * IMDb first because it is the id TMDB holds for both kinds, where `tvdb_id` is shows
 * only. There is no preference to express for films: `/movie/{id}` carries an IMDb id or
 * nothing.
 */
function externalIdFrom(
  ids: TmdbExternalIdsPayload | null | undefined,
): ExternalId | null {
  const imdbId = textFrom(ids?.imdb_id);
  if (imdbId !== null && isImdbTitleId(imdbId)) return `imdb:${imdbId}`;

  const tvdbId = integerFrom(ids?.tvdb_id);
  if (tvdbId !== null && tvdbId > 0) return `tvdb:${tvdbId}`;

  return null;
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
    // `/movie/{id}` carries `imdb_id` itself, and carries no TVDB id at all, so a film's
    // external id costs no request and has only one source to consider.
    externalId: externalIdFrom({ imdb_id: movie.imdb_id }),
    releaseYear: releaseYearFrom(movie.release_date),
    // The same field, kept whole. Both go through a normaliser rather than being read
    // raw, because `""` is how TMDB spells *undated* and Postgres's `date` refuses it.
    releaseDate: dateFrom(movie.release_date),
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
    // Null unless the request carried `SHOW_EXTERNAL_IDS_APPEND` — see the constant.
    externalId: externalIdFrom(show.external_ids),
    releaseYear: releaseYearFrom(show.first_air_date),
    // A show's release date is the day it first aired — the same field the year comes
    // from, which is what keeps the two columns from being able to disagree.
    releaseDate: dateFrom(show.first_air_date),
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
        // `textFrom`, exactly as `posterPath` uses it: `""` is a path that would resolve
        // to the CDN root and render broken, where `null` renders the placeholder.
        stillPath: textFrom(episode.still_path),
      });
    }
  }

  return [...byTmdbId.values()].sort(
    (a, b) => a.seasonNo - b.seasonNo || a.episodeNo - b.episodeNo,
  );
}

/**
 * A non-2xx answer from TMDB, carrying the status a caller can branch on. Thrown by
 * `tmdb/catalogue.ts`'s `get()`, but declared here rather than there.
 *
 * Not a mapping — it is pure the same way the rest of this file is (no clock, no network,
 * no database), just not TMDB-payload-shaped — and it lives here for a narrower reason
 * than purity alone: `tmdb/catalogue.ts` is `import "server-only"`, which is a no-op
 * inside Next's build but a hard throw under plain Node's module resolution, so a test
 * that imported this class from there could never run under Vitest. `applyImportChunkAction`
 * (#73) still reaches it through `catalogue.ts`'s own re-export — the split is invisible
 * to that caller.
 */
export class TmdbHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TmdbHttpError";
  }
}

/**
 * Whether a failed `titleMirror` call means *TMDB does not have this id*, as opposed to
 * *TMDB could not be reached right now*. `SPEC.md` §7 draws exactly that line — *"a title
 * TMDB cannot resolve is skipped"* against *"a chunk fails for any other reason"* — and a
 * `429` or a `500` is the second of those, not the first. Named and tested on its own
 * rather than left as an inline `instanceof` check nobody exercises directly.
 */
export function isUnresolvedTitle(error: unknown): boolean {
  return error instanceof TmdbHttpError && error.status === 404;
}
