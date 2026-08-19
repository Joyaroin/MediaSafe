import { describe, expect, it } from "vitest";

import {
  addTitleToLibrary,
  asUserId,
  getTitleDetail,
  getUnownedTitleDetail,
  libraryEntryIdForTitle,
  rateTitle,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The second read behind title detail — the one for a title you do not own (issue #148).
 *
 * `tests/title-detail.test.ts` covers `getTitleDetail`, which is scoped by library entry
 * and throws when there is no row. This file covers the path beside it, and the whole
 * reason it is a second path rather than a widening of the first: **an owned read that
 * tolerates a missing owner is the shape that leaks one account's library into
 * another's.** So the assertions here are as much about what the answer does *not*
 * contain as about what it does — a returned `state` or `rating` would be somebody's, and
 * this read has no way to say whose.
 *
 * The boundary the ticket says must not move is asserted here too, at the foot of the
 * file, rather than only in the file that owns it: a change that widened `getTitleDetail`
 * to make ownership optional would leave every test in this file green, and that is
 * exactly the change this ticket exists to not make.
 */

setUpTestDatabase("mediasafe_unowned_title_detail_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const RELEASED = daysFromToday(-30);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  seasonNo: number;
  episodeNo: number;
  name?: string | null;
}

interface SeededTitle {
  titleId: string;
  tmdbId: number;
  episodeIds: Record<string, string>;
}

/** A title in the mirror and nobody's library — the state every test here starts from,
 *  because that is what a list holding something you have not added leaves behind. */
async function seedTitle(
  tx: Transaction,
  {
    kind = "show",
    episodes = [],
    runtimeMins = null,
    posterPath = "/poster.jpg",
    releaseYear = 2019,
  }: {
    kind?: "film" | "show";
    episodes?: EpisodeSpec[];
    runtimeMins?: number | null;
    posterPath?: string | null;
    releaseYear?: number | null;
  } = {},
): Promise<SeededTitle> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId,
      name: `Title ${tmdbId}`,
      releaseYear,
      posterPath,
      runtimeMins,
      inProduction: kind === "show" ? true : null,
    })
    .returning({ id: title.id });

  const episodeIds: Record<string, string> = {};
  for (const one of episodes) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: one.seasonNo,
        episodeNo: one.episodeNo,
        name: "name" in one ? one.name : `Episode ${one.seasonNo}-${one.episodeNo}`,
        airDate: RELEASED,
      })
      .returning({ id: episode.id });
    episodeIds[`${one.seasonNo}-${one.episodeNo}`] = inserted.id;
  }

  return { titleId: row.id, tmdbId, episodeIds };
}

/** One account's whole footprint on a title: an entry, a watch, a rating, an abandonment.
 *  Every one of them is a fact `getUnownedTitleDetail` must be unable to report. */
async function seedOwner(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  episodeId: string | null,
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: seeded.titleId, abandonedAt: new Date() })
    .returning({ id: libraryEntry.id });

  await tx.insert(watch).values({
    userId,
    libraryEntryId: entry.id,
    titleId: seeded.titleId,
    episodeId,
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });

  await rateTitle(userId, entry.id, 5, tx);

  return entry.id;
}

function mirrorOf(kind: "film" | "show", tmdbId: number): TitleMirror {
  return {
    kind,
    tmdbId,
    externalId: null,
    name: `Title ${tmdbId}`,
    releaseYear: 2019,
    posterPath: "/poster.jpg",
    inProduction: kind === "show" ? true : null,
    runtimeMins: kind === "film" ? 100 : null,
    episodes: [],
  };
}

describe("getUnownedTitleDetail", () => {
  it("returns a show's mirrored fields and its episodes in season/episode order", () =>
    inTransaction(async (tx) => {
      const seeded = await seedTitle(tx, {
        episodes: [
          { seasonNo: 2, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2, name: null },
          { seasonNo: 1, episodeNo: 1, name: "Pilot" },
        ],
      });

      const detail = await getUnownedTitleDetail("show", seeded.tmdbId, tx);

      expect(detail.titleId).toBe(seeded.titleId);
      expect(detail.kind).toBe("show");
      expect(detail.tmdbId).toBe(seeded.tmdbId);
      expect(detail.name).toBe(`Title ${seeded.tmdbId}`);
      expect(detail.releaseYear).toBe(2019);
      expect(detail.posterPath).toBe("/poster.jpg");
      expect(detail.episodes.map((one) => [one.seasonNo, one.episodeNo])).toEqual([
        [1, 1],
        [1, 2],
        [2, 1],
      ]);
      // Unnamed stays null rather than becoming a number — the surface, not the read, is
      // where `Not yet named` is written (`CONTEXT.md`'s Named Episode Rule).
      expect(detail.episodes[1].name).toBeNull();
    }));

  it("returns a film's runtime, and no episodes", () =>
    inTransaction(async (tx) => {
      const seeded = await seedTitle(tx, { kind: "film", runtimeMins: 148 });

      const detail = await getUnownedTitleDetail("film", seeded.tmdbId, tx);

      expect(detail.kind).toBe("film");
      expect(detail.runtimeMins).toBe(148);
      expect(detail.episodes).toEqual([]);
    }));

  it("carries no field an owned fact could arrive in", () =>
    inTransaction(async (tx) => {
      const seeded = await seedTitle(tx, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      const detail = await getUnownedTitleDetail("show", seeded.tmdbId, tx);

      // Asserted as the whole key set rather than as five absences: a field added later
      // fails this, which is the point — every one of `getTitleDetail`'s own extra fields
      // (`libraryEntryId`, `state`, `rating`, and an episode's `watched` and `upNext`) is
      // one account's answer, and this read has no account to answer for.
      expect(Object.keys(detail).sort()).toEqual([
        "episodes",
        "kind",
        "name",
        "posterPath",
        "releaseYear",
        "runtimeMins",
        "titleId",
        "tmdbId",
      ]);
      expect(Object.keys(detail.episodes[0]).sort()).toEqual([
        "episodeNo",
        "id",
        "name",
        "seasonNo",
      ]);
    }));

  it("answers a title two other accounts have watched, rated and abandoned exactly as it answers an untouched one", () =>
    inTransaction(async (tx) => {
      const seeded = await seedTitle(tx, {
        episodes: [
          { seasonNo: 1, episodeNo: 1 },
          { seasonNo: 1, episodeNo: 2 },
        ],
      });

      const before = await getUnownedTitleDetail("show", seeded.tmdbId, tx);

      const one = await seedUser(tx, "one");
      const two = await seedUser(tx, "two");
      await seedOwner(tx, one, seeded, seeded.episodeIds["1-1"]);
      await seedOwner(tx, two, seeded, seeded.episodeIds["1-2"]);

      // The read is the same read, and the answer is the same answer. Two accounts'
      // entries, watches, ratings and abandonments now exist against this title, and none
      // of them is reachable from here — not by a field, and not by a changed value in
      // one that already existed.
      expect(await getUnownedTitleDetail("show", seeded.tmdbId, tx)).toEqual(before);
    }));

  it("throws for a TMDB id the mirror has never seen", () =>
    inTransaction(async (tx) => {
      await expect(getUnownedTitleDetail("show", 8_675_309, tx)).rejects.toThrow();
    }));

  it("throws when the id belongs to the other kind — TMDB numbers films and shows separately", () =>
    inTransaction(async (tx) => {
      const seeded = await seedTitle(tx, { kind: "show" });

      await expect(getUnownedTitleDetail("film", seeded.tmdbId, tx)).rejects.toThrow();
    }));
});

describe("libraryEntryIdForTitle", () => {
  it("answers this account's own entry", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const seeded = await seedTitle(tx);
      const entryId = await seedOwner(tx, reader, seeded, null);

      expect(await libraryEntryIdForTitle(reader, "show", seeded.tmdbId, tx)).toBe(
        entryId,
      );
    }));

  it("answers null for a title this account has not added, whoever else has", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      const seeded = await seedTitle(tx);
      await seedOwner(tx, stranger, seeded, null);

      // Null is *you have not added this*, a real state with a real surface — the page
      // this feeds. It is never the stranger's entry id, which is the leak this read
      // would be if `ownedBy` were left off it.
      expect(await libraryEntryIdForTitle(reader, "show", seeded.tmdbId, tx)).toBeNull();
    }));

  it("answers null for a title the mirror does not hold", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      expect(await libraryEntryIdForTitle(reader, "show", 8_675_309, tx)).toBeNull();
    }));
});

describe("adding a title you do not own", () => {
  it("puts it in the library on the watchlist, and title detail then reads it like any other", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const seeded = await seedTitle(tx, { episodes: [{ seasonNo: 1, episodeNo: 1 }] });

      // The write the page's *Add to library* runs, with the mirror the action fetches —
      // the same pair the search screen's add already uses, so there is one way into a
      // library rather than two.
      await addTitleToLibrary(reader, mirrorOf("show", seeded.tmdbId), tx);

      const entryId = await libraryEntryIdForTitle(reader, "show", seeded.tmdbId, tx);
      expect(entryId).not.toBeNull();

      const detail = await getTitleDetail(reader, entryId ?? "", tx);
      expect(detail.state).toBe("watchlist");
      expect(detail.rating).toBeNull();
      expect(detail.episodes).toHaveLength(1);
      expect(detail.episodes[0].watched).toBe(false);
    }));
});

describe("getTitleDetail, which this ticket does not widen", () => {
  it("still throws for a library entry id that is not in this account's library", () =>
    inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      const seeded = await seedTitle(tx);
      const strangersEntry = await seedOwner(tx, stranger, seeded, null);

      await expect(getTitleDetail(reader, strangersEntry, tx)).rejects.toThrow();
      await expect(
        getTitleDetail(reader, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    }));
});
