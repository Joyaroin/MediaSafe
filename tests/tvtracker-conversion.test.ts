import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readNativeImportFile } from "@/import/native-format";
import {
  ConversionHalt,
  IMPORT_SOURCE,
  TVTRACKER_ACCOUNT_ID,
  convertTvtrackerExport,
  mapToNativeImport,
  parseConfirmFile,
  type ConfirmFile,
  type ConversionResult,
  type EpisodeCoordinate,
  type EpisodeIndex,
  type IndexedEpisode,
} from "@/scripts/convert-tvtracker/map";
import { parseTvtrackerDump, type TvtrackerExport } from "@/scripts/convert-tvtracker/parse";

/**
 * **Test 1 of `SPEC.md` §6's four** — *"the import mapping, a pure function in `scripts/`,
 * tested against the committed export"* (issue #71).
 *
 * This is the assertion the whole conversion was shaped to make possible. `map.ts` touches
 * no filesystem, no network, no TMDB and no clock, so the mapping can be run here over the
 * **real archive** — 472 titles and 18,649 episode rows — and counted. Only the gunzip
 * below is IO.
 *
 * It matters more than a normal test. `fixtures/` is the only surviving copy of
 * `tvtracker`'s database; the Supabase project and the source repository are both gone. A
 * mapping bug does not throw, it writes a library that is quietly missing history, and
 * there is nothing to compare the result against afterwards. So the numbers here are
 * *measured against the export*, and every one of them is stated as an exact figure —
 * an approximate assertion is one that passes while the thing it describes drifts.
 *
 * ── Why an episode index is supplied rather than fetched ──────────────────────────────
 *
 * `episode_overrides` is keyed `(show_id, season_number, episode_number)`; the native
 * format is keyed by `tmdb_episode_id`. #16 chose that deliberately — season and episode
 * numbers are borrowed attributes and a renumber upstream would silently repoint history —
 * so the resolution is TMDB's answer, `resolve.ts` fetches it at conversion time, and the
 * mapping takes it as an input.
 *
 * **`stubEpisodeIndex` stands in for TMDB here, and what that does and does not prove is
 * worth being exact about.** It proves the mapping's arithmetic: which rows become
 * watches, how many, which carry a date, which shows halt. It does not — and cannot —
 * prove that TMDB agrees with `tvtracker` about how many episodes Schitt's Creek has. That
 * disagreement is a conversion-time halt with a human watching, which is what #68 chose
 * over a committed resolution cache, and the halt itself *is* asserted below.
 */

const REPO = path.resolve(import.meta.dirname, "..");
const ARCHIVE = "tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz";

/** The second account in the export — 10 titles that must not reach the seed. */
const OTHER_ACCOUNT_ID = "7743157b-fc5f-49fd-8864-b3daacc935ac";

const SCHITTS_CREEK = 61662;
const SEVEN_DIALS = 250505;
const NINE_ONE_ONE = 75219;
const HUDSON_AND_REX = 87940;
const PERSON_OF_INTEREST = 1411;

let cached: TvtrackerExport | undefined;

/**
 * The archive, parsed once.
 *
 * **This file and `scripts/convert-tvtracker/cli.ts` are the only two things permitted to
 * name the archive** — `tests/fixture-archive.test.ts` holds that allowlist, and
 * `fixtures/README.md` predicted this exact moment: *"when step 3 lands, that script is
 * the first and only thing permitted to read these files"*. §6 defines test 1 as reading
 * the committed export, so the test necessarily names it too.
 */
function archive(): TvtrackerExport {
  if (cached === undefined) {
    const gz = readFileSync(path.join(REPO, "fixtures", ARCHIVE));
    cached = parseTvtrackerDump(gunzipSync(gz).toString("utf8"));
  }
  return cached;
}

const EMPTY_CONFIRM: ConfirmFile = { confirmations: [], unplaceable: [] };

const key = ({ season, episode }: EpisodeCoordinate): string => `${season}:${episode}`;

/**
 * A deterministic stand-in for `resolve.ts`'s TMDB lookup.
 *
 * Every episode the export names for a title, plus — for a title watched right through —
 * a full season-one run long enough to reach its `total_episodes`, because a whole-show
 * watermark expands to every episode TMDB lists and the export names only a handful of
 * them. The layout is synthetic; the *count* is `tvtracker`'s own `total_episodes`, so the
 * expansions asserted below are the export's arithmetic rather than this file's invention.
 *
 * Ids are `tmdbId · 10⁶ + season · 10³ + episode`: unique across titles, stable between
 * runs, and positive integers, which is what `import/native-format.ts` requires.
 */
function stubEpisodeIndex(
  exported: TvtrackerExport,
  extra: ReadonlyMap<number, readonly EpisodeCoordinate[]> = new Map(),
): EpisodeIndex {
  const showsById = new Map(exported.shows.map((show) => [show.id, show]));
  const coordinates = new Map<number, Map<string, EpisodeCoordinate>>();

  const add = (tmdbId: number, coordinate: EpisodeCoordinate): void => {
    let forTitle = coordinates.get(tmdbId);
    if (forTitle === undefined) {
      forTitle = new Map();
      coordinates.set(tmdbId, forTitle);
    }
    forTitle.set(key(coordinate), coordinate);
  };

  for (const [tmdbId, extras] of extra) for (const c of extras) add(tmdbId, c);

  for (const row of exported.overrides) {
    const show = showsById.get(row.showId);
    if (show !== undefined) {
      add(show.tmdbId, { season: row.seasonNumber, episode: row.episodeNumber });
    }
  }

  const watchedRows = new Map<string, number>();
  for (const row of exported.overrides) {
    if (row.watched) watchedRows.set(row.showId, (watchedRows.get(row.showId) ?? 0) + 1);
  }

  for (const show of exported.shows) {
    const unaccountedFor = show.watchedThrough - (watchedRows.get(show.id) ?? 0);
    const wholeShow = unaccountedFor > 0 && show.watchedThrough === show.totalEpisodes;
    if (!wholeShow) continue;
    for (let episode = 1; episode <= show.totalEpisodes; episode++) {
      add(show.tmdbId, { season: 1, episode });
    }
    const size = coordinates.get(show.tmdbId)?.size ?? 0;
    if (size !== show.totalEpisodes) {
      throw new Error(
        `The stub index built ${size} episodes for ${show.name}, which claims ${show.totalEpisodes}. ` +
          "The stub is wrong, not the mapping — fix it here rather than loosening the assertion.",
      );
    }
  }

  return new Map(
    [...coordinates].map(([tmdbId, forTitle]) => [
      tmdbId,
      [...forTitle.values()].map(
        (c): IndexedEpisode => ({
          ...c,
          tmdbEpisodeId: tmdbId * 1_000_000 + c.season * 1_000 + c.episode,
        }),
      ),
    ]),
  );
}

/** The confirm entry shape, as `convert.confirm.json` spells it. */
function confirm(
  tmdbId: number,
  title: string,
  credit: readonly EpisodeCoordinate[],
): ConfirmFile {
  return parseConfirmFile({
    confirmations: [
      {
        tmdb_id: tmdbId,
        title,
        reason: "Asserted by tests/tvtracker-conversion.test.ts, not a decision about the library.",
        credit,
      },
    ],
  });
}

function merge(...files: ConfirmFile[]): ConfirmFile {
  return {
    confirmations: files.flatMap((file) => file.confirmations),
    unplaceable: files.flatMap((file) => file.unplaceable),
  };
}

/** Seven episodes each, standing in for the answer a person gives at cutover. */
const SEVEN = Array.from({ length: 7 }, (_, i) => ({ season: 1, episode: i + 1 }));

const ANSWERED = merge(
  confirm(HUDSON_AND_REX, "Hudson & Rex", SEVEN),
  confirm(PERSON_OF_INTEREST, "Person of Interest", SEVEN),
);

const EXTRA_EPISODES = new Map<number, readonly EpisodeCoordinate[]>([
  [HUDSON_AND_REX, SEVEN],
  [PERSON_OF_INTEREST, SEVEN],
]);

/** The conversion, run over the real archive with the two ambiguous shows answered. */
function convert(
  confirmations: ConfirmFile = ANSWERED,
  exported: TvtrackerExport = archive(),
): ConversionResult {
  return mapToNativeImport(exported, {
    accountId: TVTRACKER_ACCOUNT_ID,
    episodeIndex: stubEpisodeIndex(exported, EXTRA_EPISODES),
    confirmations,
  });
}

/** The same run with both ambiguous shows answered "the watermark is stale, credit nothing". */
const CREDIT_NOTHING = merge(
  confirm(HUDSON_AND_REX, "Hudson & Rex", []),
  confirm(PERSON_OF_INTEREST, "Person of Interest", []),
);

function watchesFor(result: ConversionResult, tmdbId: number) {
  return result.json.watches.filter((watch) => watch.tmdb_id === tmdbId);
}

describe("the export is read whole", () => {
  it("parses every row fixtures/README.md measured", () => {
    const exported = archive();
    // A row is not a line — `shows.overview` carries TMDB synopses with literal newlines,
    // and a line-based parser reads 471 titles here and loses one without a word.
    expect(exported.shows).toHaveLength(472);
    expect(exported.overrides).toHaveLength(18_649);
    expect(exported.movies).toHaveLength(0);
  });

  it("fails rather than report zero rows when a table cannot be found", () => {
    // `AGENTS.md`: empty and failed are structurally separate. A `pg_dump` this parser
    // cannot read — unquoted identifiers, say, which is a flag away — must not convert to
    // a seed with no history in it and no error anywhere. The header is what says the
    // table was exported; the INSERT is what says it had rows.
    const sql = gunzipSync(readFileSync(path.join(REPO, "fixtures", ARCHIVE))).toString("utf8");
    const unquoted = sql.replaceAll('INSERT INTO "public"."shows"', "INSERT INTO public.shows");
    expect(() => parseTvtrackerDump(unquoted)).toThrow(/could read 0 of them/);

    const headerless = sql.replaceAll("-- Data for Name: shows; Type: TABLE DATA", "-- gone");
    expect(() => parseTvtrackerDump(headerless)).toThrow(/no data section for public.shows/);
  });

  it("reads every INSERT for a table, not only the first", () => {
    // `pg_dump --inserts` without `--rows-per-insert` writes one statement per row, and
    // `tvtracker` is re-exported at cutover. Reading only the first would convert such an
    // export to a single title and a single watch, and would report success.
    const header = [
      "-- Data for Name: shows; Type: TABLE DATA; Schema: public; Owner: postgres",
      "-- Data for Name: episode_overrides; Type: TABLE DATA; Schema: public; Owner: postgres",
      "-- Data for Name: movies; Type: TABLE DATA; Schema: public; Owner: postgres",
    ].join("\n");
    const row = (tmdbId: number, name: string) =>
      `INSERT INTO "public"."shows" ("id", "user_id", "tmdb_id", "name", "total_episodes", ` +
      `"watch_status", "watched_through", "is_favourite", "is_pinned", "last_watched_at", "legacy") VALUES\n` +
      `\t('id-${tmdbId}', '${TVTRACKER_ACCOUNT_ID}', ${tmdbId}, '${name}', 1, 'Watching', 0, false, false, NULL, '{}');\n`;

    const parsed = parseTvtrackerDump(`${header}\n${row(1, "One")}${row(2, "Two")}`);
    expect(parsed.shows.map((show) => show.tmdbId)).toEqual([1, 2]);
    expect(parsed.overrides).toHaveLength(0);
    expect(parsed.movies).toHaveLength(0);
  });

  it("finds both accounts, with the split fixtures/README.md recorded", () => {
    const exported = archive();
    const mine = exported.shows.filter((show) => show.userId === TVTRACKER_ACCOUNT_ID);
    const theirs = exported.shows.filter((show) => show.userId === OTHER_ACCOUNT_ID);
    expect(mine).toHaveLength(462);
    expect(theirs).toHaveLength(10);
    expect(mine.length + theirs.length).toBe(exported.shows.length);
  });
});

describe("the mapping, against the real export", () => {
  it("writes 462 titles, exactly the ones the account owns", () => {
    const result = convert();
    expect(result.json.titles).toHaveLength(462);

    // #18: no environment outside production ever holds another person's rows, and this
    // file seeds every preview and every local database. 472 rows look no more wrong
    // than 462, so the set is asserted rather than the count.
    const exported = archive();
    const mine = new Set(
      exported.shows.filter((s) => s.userId === TVTRACKER_ACCOUNT_ID).map((s) => s.tmdbId),
    );
    const theirs = new Set(
      exported.shows.filter((s) => s.userId === OTHER_ACCOUNT_ID).map((s) => s.tmdbId),
    );
    expect(theirs.size).toBe(10);
    expect(new Set(result.json.titles.map((t) => t.tmdb_id))).toEqual(mine);

    // 7 of their 10 are titles the account does not hold, and none of those 7 is written.
    // The other 3 are shared, and a title cannot be told apart by `tmdb_id` once both
    // accounts have it — which is why the watch-level assertion below is the real one.
    const onlyTheirs = [...theirs].filter((tmdbId) => !mine.has(tmdbId));
    expect(onlyTheirs).toHaveLength(7);
    for (const tmdbId of onlyTheirs) {
      expect(result.json.titles.some((title) => title.tmdb_id === tmdbId)).toBe(false);
    }
    expect(result.json.watches.every((watch) => mine.has(watch.tmdb_id))).toBe(true);
  });

  it("writes none of the second account's watches onto a title both accounts hold", () => {
    // **The assertion that actually catches an unfiltered conversion.** The second account
    // has 7 episode rows and all 7 are on Attack on Titan, which the account also holds —
    // 5 of them marked watched, on S3E1-S3E5, which Adham has no row for. Filtering shows
    // but not episode rows would write those 5 into his history and change no count that
    // anyone is checking: 462 titles, and Attack on Titan simply reads 35 instead of 30.
    const exported = archive();
    const theirRows = exported.overrides.filter((row) => row.userId === OTHER_ACCOUNT_ID);
    expect(theirRows).toHaveLength(7);

    const ATTACK_ON_TITAN = 1429;
    const theirShow = exported.shows.find(
      (s) => s.tmdbId === ATTACK_ON_TITAN && s.userId === OTHER_ACCOUNT_ID,
    )!;
    expect(theirRows.every((row) => row.showId === theirShow.id)).toBe(true);
    expect(theirRows.filter((row) => row.watched)).toHaveLength(5);

    const result = convert();
    const watches = watchesFor(result, ATTACK_ON_TITAN);
    // 30 episodes, one of them watched twice — so 31 rows and 30 distinct episodes. The
    // second account's 5 rows on S3E1-E5 are in neither number.
    expect(new Set(watches.map((w) => w.tmdb_episode_id)).size).toBe(30);
    expect(watches).toHaveLength(31);

    const index = stubEpisodeIndex(exported, EXTRA_EPISODES);
    const written = new Set(watches.map((watch) => watch.tmdb_episode_id));
    for (const row of theirRows.filter((r) => r.watched)) {
      const episode = (index.get(ATTACK_ON_TITAN) ?? []).find(
        (e) => e.season === row.seasonNumber && e.episode === row.episodeNumber,
      )!;
      expect(written.has(episode.tmdbEpisodeId)).toBe(false);
    }
    expect(result.accounting.overridesRead).toBe(exported.overrides.length - 7);
  });

  it("writes one watch per recorded viewing, rewatches included", () => {
    // Far more than `SPEC.md` §7's 18,715, and the difference is the point: that figure
    // counts one watch per *episode*, because it was derived from the v3 tables alone.
    // `legacy` records one per *viewing*, and 1,209 episodes were viewed more than once.
    const result = convert();
    expect(result.json.watches).toHaveLength(19_948);
    expect(result.accounting.rewatches).toBeGreaterThan(1_000);

    // The two answered shows contribute 7 each on top of the stale-watermark reading.
    expect(convert(CREDIT_NOTHING).json.watches).toHaveLength(19_934);
  });

  it("carries the real per-episode dates out of legacy, and synthesises none", () => {
    const result = convert();
    const dated = result.json.watches.filter((watch) => watch.watched_at !== null);

    /**
     * **19,726 dated watches, where `SPEC.md` §7 says 18.**
     *
     * That figure — and #16 §4's *"the only genuine `last_watched_at` values in the
     * library"* — was measured from the v3 tables, which kept *which* episodes were watched
     * and threw away *when*. `shows.legacy` kept both: 19,678 per-episode timestamps across
     * 455 titles, 4,343 of them distinct, spanning 2021-07-26 to 2026-07-09, and **none**
     * inside the 2026-08-03 import window that makes every other timestamp in the dump a
     * stamp rather than a fact.
     *
     * Nothing here is synthesised. Every date below was read from the export, and a watch
     * the export has no date for stays `null`.
     */
    expect(dated).toHaveLength(19_726);
    expect(dated.length).toBeLessThan(result.json.watches.length);

    for (const watch of dated) {
      expect(watch.watched_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    }

    const days = new Set(dated.map((watch) => (watch.watched_at ?? "").slice(0, 10)));
    expect(days.size).toBeGreaterThan(900);
    expect([...days].sort()[0] >= "2021-07-26").toBe(true);
  });

  it("lands every date on the episode the export recorded it against", () => {
    // Not on the furthest-watched episode any more — that was the best available guess
    // when the only timestamp was the per-show `last_watched_at`. The blob names the
    // episode, so each date goes where it was recorded.
    const exported = archive();
    const index = stubEpisodeIndex(exported, EXTRA_EPISODES);
    const result = convert();

    const byTitle = new Map(
      exported.shows
        .filter((show) => show.userId === TVTRACKER_ACCOUNT_ID)
        .map((show) => [show.tmdbId, show]),
    );

    let checked = 0;
    for (const watch of result.json.watches.filter((w) => w.watched_at !== null).slice(0, 600)) {
      const show = byTitle.get(watch.tmdb_id);
      const episode = (index.get(watch.tmdb_id) ?? []).find(
        (e) => e.tmdbEpisodeId === watch.tmdb_episode_id,
      );
      if (show === undefined || episode === undefined) continue;
      const recorded = show.history.find(
        (h) => h.season === episode.season && h.episode === episode.episode,
      );
      if (recorded === undefined) continue;
      expect(recorded.watchedAt).toContain(watch.watched_at);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("marks 155 titles abandoned, as a boolean", () => {
    const result = convert();
    const abandoned = result.json.titles.filter((title) => title.abandoned);

    // `Paused` is `abandoned` spelled `tvtracker`'s way, and #25 extended it to
    // `Completed` shows that are not actually finished: 65 + 90. The clause easiest to
    // leave out is the third — a title with no watches was never started, so it is on the
    // watchlist rather than abandoned, and 2 `Paused` titles are exactly that.
    expect(abandoned).toHaveLength(155);
    for (const title of result.json.titles) expect(typeof title.abandoned).toBe("boolean");

    // And it does not move with the gate. `abandoned` reads the final watch count, so it
    // could in principle swing on how the two watermarks are answered; both of those
    // shows are `Watching` in the export, so neither is ever abandoned either way.
    expect(convert(CREDIT_NOTHING).json.titles.filter((title) => title.abandoned)).toHaveLength(155);
  });

  it("keeps titles that have no watches at all", () => {
    const result = convert(CREDIT_NOTHING);
    const withWatches = new Set(result.json.watches.map((watch) => watch.tmdb_id));
    const without = result.json.titles.filter((title) => !withWatches.has(title.tmdb_id));

    // `titles` is independent of `watches`; these become watchlist entries. 22 of them
    // with the watermarks unanswered, and Person of Interest joins the library either way.
    expect(without).toHaveLength(22);
    expect(result.accounting.titlesWithNoWatches).toBe(22);
    expect(convert().accounting.titlesWithNoWatches).toBe(21);
    for (const title of without) expect(title.abandoned === true || title.abandoned === false).toBe(true);
  });

  it("writes nothing for a row marked not watched", () => {
    const result = convert();
    const index = stubEpisodeIndex(archive(), EXTRA_EPISODES);
    const showsById = new Map(archive().shows.map((show) => [show.id, show]));

    const notWatched = archive().overrides.filter(
      (row) => !row.watched && row.userId === TVTRACKER_ACCOUNT_ID,
    );
    expect(notWatched).toHaveLength(7);

    for (const row of notWatched) {
      const show = showsById.get(row.showId)!;
      const episode = (index.get(show.tmdbId) ?? []).find(
        (e) => e.season === row.seasonNumber && e.episode === row.episodeNumber,
      );
      // Absence is the fact — there is no negative watch to store.
      expect(result.json.watches.some((w) => w.tmdb_episode_id === episode?.tmdbEpisodeId)).toBe(
        false,
      );
    }
  });

  it("declares tvtracker as the source and numbers every key by occurrence", () => {
    const result = convert();
    expect(result.json.source).toBe(IMPORT_SOURCE);
    expect(result.json.source).toBe("tvtracker");

    // `<tmdb_episode_id>:<occurrence>`. #16 reserved the suffix believing it would always
    // be `:1`; `legacy` records 1,209 episodes watched more than once, so it is not.
    const occurrences = new Map<number, number[]>();
    for (const watch of result.json.watches) {
      const [id, occurrence] = watch.key.split(":");
      expect(Number(id)).toBe(watch.tmdb_episode_id);
      const seen = occurrences.get(watch.tmdb_episode_id) ?? [];
      seen.push(Number(occurrence));
      occurrences.set(watch.tmdb_episode_id, seen);
    }
    // Every episode's occurrences are 1..n with no gaps and no repeats.
    for (const seen of occurrences.values()) {
      expect([...seen].sort((x, y) => x - y)).toEqual(
        Array.from({ length: seen.length }, (_, i) => i + 1),
      );
    }
    expect(new Set(result.json.watches.map((w) => w.key)).size).toBe(result.json.watches.length);
  });

  it("carries no borrowed metadata anywhere in the file", () => {
    const result = convert();

    for (const title of result.json.titles) {
      expect(Object.keys(title).sort()).toEqual(["abandoned", "kind", "tmdb_id"]);
      expect(title.kind).toBe("show");
    }
    for (const watch of result.json.watches) {
      expect(Object.keys(watch).sort()).toEqual([
        "key",
        "tmdb_episode_id",
        "tmdb_id",
        "watched_at",
      ]);
    }

    // Stronger than a field check: strike out every word the format is allowed to contain
    // and assert no letter survives. A name, a poster path, an air date or an original
    // title would all leave one behind.
    const residue = JSON.stringify(result.json)
      .replaceAll(
        /"(source|titles|watches|tmdb_id|kind|abandoned|tmdb_episode_id|watched_at|key)":/g,
        ":",
      )
      .replaceAll('"tvtracker"', "")
      .replaceAll('"show"', "")
      .replaceAll(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, "")
      .replaceAll(/"\d+:\d+"/g, "")
      .replaceAll(/true|false|null/g, "");
    expect(residue).not.toMatch(/[A-Za-z]/);

    // And the names themselves, since that is the field an accident would carry.
    const text = JSON.stringify(result.json);
    for (const show of archive().shows) {
      if (show.name.length >= 4) expect(text).not.toContain(show.name);
    }
  });

  it("is accepted by the app's own reader", () => {
    // The file the script writes is the file import reads. Round-tripping it through
    // `readNativeImportFile` is what makes "no borrowed metadata" the *reader's* refusal
    // rather than an assertion in this file that could drift away from it.
    const text = `${JSON.stringify(convert().json, null, 2)}\n`;
    const read = readNativeImportFile(text);
    expect(read.titles).toHaveLength(462);
    expect(read.watches).toHaveLength(19_948);
    expect(read.source).toBe("tvtracker");
  });

  it("produces byte-identical output twice", () => {
    const once = JSON.stringify(convert().json);
    const twice = JSON.stringify(convert().json);
    expect(once).toBe(twice);

    // And from the dump text, not only from the parsed rows — the parse is part of the
    // pure half, so determinism has to hold across the whole of it.
    const sql = gunzipSync(readFileSync(path.join(REPO, "fixtures", ARCHIVE))).toString("utf8");
    const options = {
      accountId: TVTRACKER_ACCOUNT_ID,
      episodeIndex: stubEpisodeIndex(archive(), EXTRA_EPISODES),
      confirmations: ANSWERED,
    };
    expect(JSON.stringify(convertTvtrackerExport(sql, options).json)).toBe(once);
  });

  it("reports what it dropped rather than dropping it quietly", () => {
    const { accounting } = convert();
    expect(accounting.titlesInExport).toBe(472);
    expect(accounting.titlesForOtherAccounts).toBe(10);
    expect(accounting.titlesWritten).toBe(462);
    expect(accounting.overridesRead).toBe(18_642);
    expect(accounting.overridesMarkedWatched).toBe(18_635);
    expect(accounting.overridesMarkedNotWatched).toBe(7);
    expect(accounting.dropped.join(" ")).toContain("4 favourite(s)");
    expect(accounting.dropped.join(" ")).toContain("2 pin(s)");
    expect(accounting.dropped.join(" ")).toContain("added_at");
  });
});

describe("the watermark cases", () => {
  it("expands Schitt's Creek to 79 and replaces its one bogus row", () => {
    const result = convert();
    const watches = watchesFor(result, SCHITTS_CREEK);
    expect(watches).toHaveLength(79);

    // Its lone override reads S1E26 — not a real coordinate for a show whose first season
    // has thirteen episodes. The whole-show expansion replaces the overrides rather than
    // adding to them, so the bad coordinate is never resolved and never written.
    const show = archive().shows.find((s) => s.tmdbId === SCHITTS_CREEK)!;
    const rows = archive().overrides.filter((row) => row.showId === show.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seasonNumber: 1, episodeNumber: 26, watched: true });
    expect(show.watchedThrough).toBe(79);
    expect(show.totalEpisodes).toBe(79);
  });

  it("expands Agatha Christie's Seven Dials to 2 — the whole show less the false row", () => {
    expect(watchesFor(convert(), SEVEN_DIALS)).toHaveLength(2);

    const show = archive().shows.find((s) => s.tmdbId === SEVEN_DIALS)!;
    const rows = archive().overrides.filter((row) => row.showId === show.id);
    expect(show.watchedThrough).toBe(3);
    expect(show.totalEpisodes).toBe(3);
    expect(rows).toHaveLength(1);
    expect(rows[0].watched).toBe(false);
  });

  it("does not expand 9-1-1", () => {
    // Its watermark reads 134 against 133 rows marked watched, which looks like a
    // shortfall of one and is not: two episodes below the watermark are explicitly marked
    // *not* watched, so the rows already are the whole truth.
    const watches = watchesFor(convert(), NINE_ONE_ONE);
    // The 133 episodes the override rows name, and no more — the watermark reads 134 only
    // because two episodes below it are explicitly marked not watched. The row count is
    // higher again, because many of the 133 were watched twice.
    expect(new Set(watches.map((w) => w.tmdb_episode_id)).size).toBe(133);
    expect(watches.length).toBeGreaterThan(133);

    const show = archive().shows.find((s) => s.tmdbId === NINE_ONE_ONE)!;
    expect(show.watchedThrough).toBe(134);
    expect(show.totalEpisodes).toBe(143);
    const rows = archive().overrides.filter((row) => row.showId === show.id);
    expect(rows.filter((row) => row.watched)).toHaveLength(133);
    expect(rows.filter((row) => !row.watched)).toHaveLength(2);
    expect(convert().accounting.wholeShowExpansions.map((s) => s.tmdbId)).not.toContain(
      NINE_ONE_ONE,
    );
  });

  it("halts on Hudson & Rex and Person of Interest with an empty confirm file", () => {
    expect(() => convert(EMPTY_CONFIRM)).toThrow(ConversionHalt);

    let message = "";
    try {
      convert(EMPTY_CONFIRM);
    } catch (error) {
      // Reported, not swallowed — `mediasafe/no-empty-catch` forbids turning a failure
      // into a successful-looking empty result, and this rethrows nothing only because
      // the message *is* what is under test.
      message = (error as Error).message;
    }

    expect(message).toContain("Hudson & Rex");
    expect(message).toContain("Person of Interest");
    // The halt names the evidence, so a person can answer it without opening the dump.
    expect(message).toContain("watched through 60 of 122");
    expect(message).toContain("watched through 7 of 103");
    expect(message).toContain("53 episodes are marked watched");
    expect(message).toContain("convert.confirm.json");
    expect(message).not.toMatch(/probabl|likely|assum|guess(?!)/i);
  });

  it("expands them as configured when the confirm file names them", () => {
    // The gate asserted in the other direction. A gate only ever seen open is not a gate,
    // and neither is one only ever seen shut.
    const result = convert(ANSWERED);
    expect(watchesFor(result, HUDSON_AND_REX)).toHaveLength(60);
    expect(watchesFor(result, PERSON_OF_INTEREST)).toHaveLength(7);
    expect(result.accounting.confirmedExpansions.map((s) => s.tmdbId).sort()).toEqual([
      PERSON_OF_INTEREST,
      HUDSON_AND_REX,
    ]);

    // And an empty credit list is an answer too: the watermark is stale, write nothing.
    const nothing = convert(CREDIT_NOTHING);
    expect(watchesFor(nothing, HUDSON_AND_REX)).toHaveLength(53);
    expect(watchesFor(nothing, PERSON_OF_INTEREST)).toHaveLength(0);
  });

  it("halts on a fabricated straggler the confirm file does not name", () => {
    // The gate is a *condition*, not a hard-coded pair of titles. `tvtracker` is
    // re-exported at cutover, so tomorrow's stragglers must stop the script rather than
    // inherit today's answers.
    const exported = archive();
    const watched = new Map<string, number>();
    for (const row of exported.overrides) {
      if (row.watched) watched.set(row.showId, (watched.get(row.showId) ?? 0) + 1);
    }

    const victim = exported.shows
      .filter(
        (show) =>
          show.userId === TVTRACKER_ACCOUNT_ID &&
          (watched.get(show.id) ?? 0) > 0 &&
          show.totalEpisodes > show.watchedThrough + 5 &&
          show.tmdbId !== HUDSON_AND_REX,
      )
      .sort((a, b) => a.tmdbId - b.tmdbId)[0];
    expect(victim).toBeDefined();

    const fabricated: TvtrackerExport = {
      ...exported,
      shows: exported.shows.map((show) =>
        show.id === victim.id ? { ...show, watchedThrough: show.watchedThrough + 3 } : show,
      ),
    };

    let message = "";
    try {
      convert(ANSWERED, fabricated);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(victim.name);
    expect(message).toContain("3 watch(es) with no episode named");
  });

  it("halts on an answer left behind for a show that no longer needs one", () => {
    // The converse of the case above, and the one that would otherwise rot silently: a
    // fresh export in which a show stopped being ambiguous must not carry today's answer
    // forward unread.
    const stale = merge(ANSWERED, confirm(SCHITTS_CREEK, "Schitt's Creek", []));
    expect(() => convert(stale)).toThrow(/does not ask about/);
  });

  it("halts when TMDB does not list an episode the export names", () => {
    // The property #16 bought by keying the format on episode id rather than on
    // `(season, episode)`: a renumber fails here, with a human watching, instead of
    // months later in a preview deploy.
    const exported = archive();
    const full = stubEpisodeIndex(exported, EXTRA_EPISODES);
    const shortened = new Map(
      [...full].map(([tmdbId, episodes]) => [
        tmdbId,
        tmdbId === NINE_ONE_ONE ? episodes.slice(0, 10) : episodes,
      ]),
    );

    let message = "";
    try {
      mapToNativeImport(exported, {
        accountId: TVTRACKER_ACCOUNT_ID,
        episodeIndex: shortened,
        confirmations: ANSWERED,
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/name an episode TMDB does not list/);
    expect(message).toContain("9-1-1");

    // Every miss at once, not the first. There are 45 shows' worth in the real export, and
    // halting on one at a time means re-running two minutes of TMDB requests to be told
    // about the next.
    expect(message).toMatch(/123 recorded watch\(es\) across 1 show\(s\)/);
    expect(message).toContain("S9E10");
  });

  it("halts when a title has no episodes resolved at all", () => {
    // The other half of the same property: a title TMDB no longer answers for must stop
    // the run, not quietly become a watchlist entry with its history dropped.
    const exported = archive();
    const withoutOne = new Map(stubEpisodeIndex(exported, EXTRA_EPISODES));
    withoutOne.delete(NINE_ONE_ONE);

    expect(() =>
      mapToNativeImport(exported, {
        accountId: TVTRACKER_ACCOUNT_ID,
        episodeIndex: withoutOne,
        confirmations: ANSWERED,
      }),
    ).toThrow(/has no episodes resolved/);
  });

  it("halts on a film, which nothing maps yet", () => {
    const exported: TvtrackerExport = {
      ...archive(),
      movies: [{ userId: TVTRACKER_ACCOUNT_ID, title: "Paddington in Peru" }],
    };
    // `public.movies` holds zero rows today. One added before cutover would otherwise be
    // dropped without a word, which is the failure this whole ticket exists to prevent.
    expect(() => convert(ANSWERED, exported)).toThrow(/maps shows only/);
  });
});

function committedConfirmFile(): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO, "scripts", "convert-tvtracker", "convert.confirm.json"), "utf8"),
  );
}

describe("convert.confirm.json, as committed", () => {
  it("is a valid confirm file", () => {
    expect(() => parseConfirmFile(committedConfirmFile())).not.toThrow();
  });

  it("records why each answer is the right one", () => {
    // The answer outlives the person who wrote it, and the next re-export is read by
    // whoever is at the terminal that day.
    for (const confirmation of parseConfirmFile(committedConfirmFile()).confirmations) {
      expect(confirmation.reason.length).toBeGreaterThan(40);
      expect(confirmation.title.length).toBeGreaterThan(0);
    }
  });

  it("answers both ambiguous shows, so the conversion completes", () => {
    // Answered by Adham on 2026-08-18 (#61 asks for exactly this and forbids the agent
    // deciding it): drop both watermarks. Neither show gains a watch it cannot place, and
    // neither loses the watches its episode rows actually record.
    const committed = parseConfirmFile(committedConfirmFile());
    expect(committed.confirmations.map((c) => c.tmdbId).sort()).toEqual([
      PERSON_OF_INTEREST,
      HUDSON_AND_REX,
    ]);
    for (const confirmation of committed.confirmations) expect(confirmation.credit).toHaveLength(0);

    /**
     * The `unplaceable` half is dropped here, and that is a statement about the stub rather
     * than about the file.
     *
     * `stubEpisodeIndex` is built from the export's own coordinates, so every one of them
     * resolves and there is nothing unplaceable to accept. Those acceptances answer what
     * *real* TMDB does not list, which only the live conversion sees — and the count check
     * that guards them is asserted directly below instead.
     */
    const result = convert({ confirmations: committed.confirmations, unplaceable: [] });
    // The figure `SPEC.md` §7 and #16 both carry, and now the one the seed actually holds.
    expect(result.json.titles).toHaveLength(462);
    expect(result.json.watches).toHaveLength(19_934);
    expect(watchesFor(result, HUDSON_AND_REX)).toHaveLength(53);
    expect(watchesFor(result, PERSON_OF_INTEREST)).toHaveLength(0);
  });

  it("holds an unplaceable acceptance to its exact count", () => {
    // The guard that keeps the acceptances from rotting: `tvtracker` is re-exported at
    // cutover, and an acceptance whose number no longer matches must stop the run rather
    // than be inherited unread.
    const exported = archive();
    const full = stubEpisodeIndex(exported, EXTRA_EPISODES);
    const shortened = new Map(
      [...full].map(([tmdbId, episodes]) => [
        tmdbId,
        tmdbId === NINE_ONE_ONE ? episodes.slice(0, 10) : episodes,
      ]),
    );
    const run = (drop: number) =>
      mapToNativeImport(exported, {
        accountId: TVTRACKER_ACCOUNT_ID,
        episodeIndex: shortened,
        confirmations: {
          confirmations: ANSWERED.confirmations,
          unplaceable: [
            { tmdbId: NINE_ONE_ONE, title: "9-1-1", reason: "asserted by the test", drop },
          ],
        },
      });

    // 123 is what this shortened index cannot place; anything else is a stale acceptance.
    expect(() => run(122)).toThrow(/accepts 122 unplaceable watch\(es\)[\s\S]*has 123/);
    expect(() => run(0)).toThrow(ConversionHalt);

    const accepted = run(123);
    expect(accepted.accounting.unplaceableDropped).toBe(123);
    expect(watchesFor(accepted, NINE_ONE_ONE).length).toBeGreaterThan(0);
  });

  it("still halts if an answer is removed", () => {
    // The gate has to stay a gate after it has been opened once. Drop either answer and
    // the run stops again, so a future re-export cannot inherit a half-answered file.
    const committed = parseConfirmFile(committedConfirmFile());
    for (const dropped of committed.confirmations) {
      const partial: ConfirmFile = {
        confirmations: committed.confirmations.filter((c) => c.tmdbId !== dropped.tmdbId),
        unplaceable: [],
      };
      expect(() => convert(partial)).toThrow(ConversionHalt);
    }
  });

  it("refuses a confirm file that is the wrong shape", () => {
    expect(() => parseConfirmFile({ confirmations: [{ tmdb_id: 1 }] })).toThrow(/must name the show/);
    expect(() => parseConfirmFile({ confirmations: [{}] })).toThrow(ConversionHalt);
    expect(() => parseConfirmFile({})).toThrow(/"confirmations" array/);
    expect(() =>
      parseConfirmFile({
        confirmations: [{ tmdb_id: 1, title: "x", reason: "y", credit: [], extra: true }],
      }),
    ).toThrow(/unexpected field/);
  });
});
