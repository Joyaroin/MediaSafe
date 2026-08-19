import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToLibrary,
  asUserId,
  libraryCatalogueKeys,
  ownedBy,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user } from "@/db/schema";
import { catalogueKeyOf, type TitleMirror } from "@/tmdb/mirror";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The add, against real Postgres.
 *
 * `tests/tmdb-mirror.test.ts` pins what TMDB's responses become. This file pins what
 * happens when those rows meet the schema, and it exists for the same reason that one
 * does: **`title` and `episode` are global and unowned** (ADR-0001), so one account
 * adding a show writes rows every other account reads. The assertions below are the ones
 * whose failure would be invisible from inside one library — a second account's add
 * duplicating a title, or an add that half-lands.
 *
 * `setUpTestDatabase` and `inTransaction` from issue #40's harness, and nothing else.
 */

setUpTestDatabase("mediasafe_add_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/** A show mirror in the shape `tmdb/mirror.ts` produces. */
function showMirrorFixture(overrides: Partial<TitleMirror> = {}): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "show",
    tmdbId,
    // TVDB, which is the branch a show takes when TMDB has no IMDb id for it.
    externalId: `tvdb:${tmdbId}`,
    name: `Show ${tmdbId}`,
    releaseYear: 2011,
    posterPath: "/poster.jpg",
    inProduction: false,
    runtimeMins: null,
    episodes: [
      {
        tmdbEpisodeId: nextNumber() + 900_000,
        seasonNo: 1,
        episodeNo: 1,
        name: "Winter Is Coming",
        airDate: "2011-04-17",
        runtimeMins: 62,
      },
      {
        tmdbEpisodeId: nextNumber() + 900_000,
        seasonNo: 1,
        episodeNo: 2,
        name: "The Kingsroad",
        airDate: "2011-04-24",
        runtimeMins: 56,
      },
    ],
    ...overrides,
  };
}

function filmMirrorFixture(): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "film",
    tmdbId,
    // The other half of the column: a title TMDB has no external id for. It is written
    // as absent, never as a placeholder, and the row is perfectly valid without one.
    externalId: null,
    name: `Film ${tmdbId}`,
    releaseYear: 1977,
    posterPath: "/film.jpg",
    inProduction: null,
    runtimeMins: 121,
    episodes: [],
  };
}

async function entriesFor(tx: Transaction, userId: UserId) {
  return tx.select().from(libraryEntry).where(ownedBy(userId, libraryEntry));
}

describe("addTitleToLibrary", () => {
  it("writes the title, its episodes and the library entry", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirrorFixture();

      expect(await addTitleToLibrary(userId, mirror, tx)).toEqual({ added: true });

      const [row] = await tx
        .select()
        .from(title)
        .where(and(eq(title.kind, "show"), eq(title.tmdbId, mirror.tmdbId)));
      expect(row.name).toBe(mirror.name);
      expect(row.inProduction).toBe(false);
      // Written on every add, though nothing reads it yet: it is the only handle that
      // survives TMDB forgetting this title's id, and it can only be filled in by a
      // refresh that happens before the title vanishes.
      expect(row.externalId).toBe(mirror.externalId);

      const episodes = await tx
        .select()
        .from(episode)
        .where(eq(episode.titleId, row.id));
      // Episode names, mirrored — CONTEXT.md forbids referring to one by number alone,
      // which is what makes this column load-bearing rather than a detail-page nicety.
      expect(episodes.map((one) => one.name).sort()).toEqual([
        "The Kingsroad",
        "Winter Is Coming",
      ]);

      expect(await entriesFor(tx, userId)).toHaveLength(1);
    }));

  it("adds a film, which has no episodes to bring with it", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = filmMirrorFixture();

      expect(await addTitleToLibrary(userId, mirror, tx)).toEqual({ added: true });

      const [row] = await tx
        .select()
        .from(title)
        .where(and(eq(title.kind, "film"), eq(title.tmdbId, mirror.tmdbId)));
      expect(row.runtimeMins).toBe(121);
      expect(row.externalId).toBeNull();
      expect(await tx.select().from(episode).where(eq(episode.titleId, row.id))).toEqual(
        [],
      );
    }));

  it("does not add the same title twice, and says which happened", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const mirror = showMirrorFixture();

      expect(await addTitleToLibrary(userId, mirror, tx)).toEqual({ added: true });
      // The screen offers no second add, so this is a retry or two tabs — not a bug, and
      // not a reason to fail. It reports `added: false` so the caller can tell the
      // difference rather than assuming.
      expect(await addTitleToLibrary(userId, mirror, tx)).toEqual({ added: false });

      expect(await entriesFor(tx, userId)).toHaveLength(1);
    }));

  it("shares one global title row between two accounts", () =>
    inTransaction(async (tx) => {
      const adham = await seedUser(tx, "adham");
      const other = await seedUser(tx, "other");
      const mirror = showMirrorFixture();

      await addTitleToLibrary(adham, mirror, tx);
      expect(await addTitleToLibrary(other, mirror, tx)).toEqual({ added: true });

      // One row per TMDB id, whoever added it. This is the design (ADR-0001), and it is
      // why the mapping that produces these rows is tested infrastructure.
      const rows = await tx
        .select()
        .from(title)
        .where(and(eq(title.kind, "show"), eq(title.tmdbId, mirror.tmdbId)));
      expect(rows).toHaveLength(1);

      expect(await entriesFor(tx, adham)).toHaveLength(1);
      expect(await entriesFor(tx, other)).toHaveLength(1);
    }));

  it("refreshes the shared mirror when a second account adds a title", () =>
    inTransaction(async (tx) => {
      const adham = await seedUser(tx, "adham");
      const other = await seedUser(tx, "other");
      const mirror = showMirrorFixture();

      await addTitleToLibrary(adham, mirror, tx);

      // Between the two adds, TMDB renamed the show, ended it, and named an episode it
      // had not named before. Adding is the natural refresh point, so the second add
      // updates what the first account sees too.
      const later: TitleMirror = {
        ...mirror,
        name: "Game of Thrones",
        inProduction: true,
        // And TMDB now has an IMDb id where it had only a TVDB one. Borrowed like every
        // other column here: the last thing TMDB said is what the mirror says.
        externalId: "imdb:tt0944947",
        episodes: [
          ...mirror.episodes,
          {
            tmdbEpisodeId: mirror.episodes[0].tmdbEpisodeId + 1_000_000,
            seasonNo: 1,
            episodeNo: 3,
            name: "Lord Snow",
            airDate: "2011-05-01",
            runtimeMins: 58,
          },
        ],
      };
      await addTitleToLibrary(other, later, tx);

      const [row] = await tx
        .select()
        .from(title)
        .where(and(eq(title.kind, "show"), eq(title.tmdbId, mirror.tmdbId)));
      expect(row.name).toBe("Game of Thrones");
      expect(row.inProduction).toBe(true);
      expect(row.externalId).toBe("imdb:tt0944947");
      expect(await tx.select().from(episode).where(eq(episode.titleId, row.id))).toHaveLength(
        3,
      );
    }));

  it("clears the external id when TMDB stops sending one", () =>
    inTransaction(async (tx) => {
      const adham = await seedUser(tx, "adham");
      const other = await seedUser(tx, "other");
      const mirror = showMirrorFixture();

      await addTitleToLibrary(adham, mirror, tx);

      // The other direction of the same rule, and the deliberate one: `external_id` is
      // borrowed, so a refresh that no longer carries one *clears* it rather than keeping
      // a handle TMDB has disowned. Pinned because it is the branch that loses something
      // — the column's whole purpose is to survive TMDB forgetting this title — and a
      // behaviour that costs that much should fail a test if it is ever changed by
      // accident rather than on purpose.
      await addTitleToLibrary(other, { ...mirror, externalId: null }, tx);

      const [row] = await tx
        .select()
        .from(title)
        .where(and(eq(title.kind, "show"), eq(title.tmdbId, mirror.tmdbId)));
      expect(row.externalId).toBeNull();
    }));

  it("keeps a film and a show that share a TMDB id apart", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const film = filmMirrorFixture();
      const show = showMirrorFixture({ tmdbId: film.tmdbId });

      await addTitleToLibrary(userId, film, tx);
      await addTitleToLibrary(userId, show, tx);

      // `UNIQUE (kind, tmdb_id)`, not `UNIQUE (tmdb_id)`: TMDB numbers films and shows
      // separately, so the same integer is two different titles.
      expect(await tx.select().from(title).where(eq(title.tmdbId, film.tmdbId))).toHaveLength(
        2,
      );
      expect(await entriesFor(tx, userId)).toHaveLength(2);
    }));

  it("writes nothing at all when the episodes cannot be written", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const broken = showMirrorFixture();
      // Two episodes claiming the same slot in the same season violates
      // `UNIQUE (title_id, season_no, episode_no)`. It stands in for the real case: TMDB
      // renumbering a season under a title somebody already mirrored.
      const clashing: TitleMirror = {
        ...broken,
        episodes: [broken.episodes[0], { ...broken.episodes[1], episodeNo: 1 }],
      };

      await expect(addTitleToLibrary(userId, clashing, tx)).rejects.toThrow();

      // The transaction is the point: a library entry pointing at a half-written show is
      // an entry whose `finished` and `caught up` states are wrong, and nothing on any
      // screen would say so.
      expect(await entriesFor(tx, userId)).toEqual([]);
      expect(
        await tx
          .select()
          .from(title)
          .where(and(eq(title.kind, "show"), eq(title.tmdbId, clashing.tmdbId))),
      ).toEqual([]);
    }));
});

describe("libraryCatalogueKeys", () => {
  it("names the results this account already has, and no others", () =>
    inTransaction(async (tx) => {
      const adham = await seedUser(tx, "adham");
      const mine = showMirrorFixture();
      const theirs = showMirrorFixture();
      await addTitleToLibrary(adham, mine, tx);

      const held = await libraryCatalogueKeys(
        adham,
        [
          { kind: "show", tmdbId: mine.tmdbId },
          { kind: "show", tmdbId: theirs.tmdbId },
        ],
        tx,
      );

      expect(held).toEqual(new Set([catalogueKeyOf(mine)]));
    }));

  it("does not report another account's library as yours", () =>
    inTransaction(async (tx) => {
      const adham = await seedUser(tx, "adham");
      const other = await seedUser(tx, "other");
      const mirror = showMirrorFixture();
      await addTitleToLibrary(other, mirror, tx);

      // The title row exists and is global; the library entry is not. Getting this wrong
      // would offer to add something you have, or refuse to add something you do not —
      // both from one missing `user_id` predicate.
      expect(await libraryCatalogueKeys(adham, [mirror], tx)).toEqual(new Set());
    }));

  it("tells a film from a show carrying the same TMDB id", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const film = filmMirrorFixture();
      await addTitleToLibrary(userId, film, tx);

      const held = await libraryCatalogueKeys(
        userId,
        [
          { kind: "film", tmdbId: film.tmdbId },
          { kind: "show", tmdbId: film.tmdbId },
        ],
        tx,
      );

      expect(held).toEqual(new Set([`film:${film.tmdbId}`]));
    }));

  it("asks nothing of the database when there are no results to ask about", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      await addTitleToLibrary(userId, showMirrorFixture(), tx);

      // Not an optimisation. `or()` over nothing is `undefined`, which would leave
      // `ownedBy` as the whole predicate and quietly return the entire library.
      expect(await libraryCatalogueKeys(userId, [], tx)).toEqual(new Set());
    }));
});
