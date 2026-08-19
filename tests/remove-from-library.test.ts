import { eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToLibrary,
  asUserId,
  ownedBy,
  removeTitleFromLibrary,
  titleFootprint,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  episode,
  libraryEntry,
  libraryEntryState,
  list,
  listMembership,
  title,
  user,
  watch,
} from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Removing one title from one library, against real Postgres — issue #142.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────
 *
 * Until this ticket the only `DELETE` in the product was account deletion, and
 * `tests/delete-account.test.ts` says why that one is tested against a migrated database
 * rather than a mock: the mechanism is `ON DELETE CASCADE`, which is a property of
 * Postgres and not of any line of TypeScript, and a mock of a cascade tests the mock.
 * Everything in that argument holds here, and one thing is sharper. Deleting an account
 * takes *everything*, so a cascade that reached one row too far is invisible inside a
 * scope that is about to be empty anyway. **Removing one title is a `DELETE` with a
 * blast radius that is supposed to stop**, and the assertions that matter are the ones
 * about where it stops: another title in the same library, another account's copy of the
 * same title, and the global catalogue underneath both.
 *
 * ── The counts are load-bearing, not decorative ──────────────────────────────────────
 *
 * The confirmation page states this title's watches and its rating in real numbers, and
 * `SPEC.md`'s honest caveat is that watches this application recorded are restorable by
 * nothing. So the numbers are the only protection there is, and *the counts shown match
 * exactly what is deleted* is asserted here rather than trusted — the same assertion
 * `tests/delete-account.test.ts` makes about its three, and for the same reason: a number
 * that does not match what the delete takes is a lie told on a screen where acting on it
 * cannot be undone.
 *
 * ── No network ───────────────────────────────────────────────────────────────────────
 *
 * `titleFootprint` and `removeTitleFromLibrary` take a user id the caller already
 * resolved and the harness's transaction, and `addTitleToLibrary` is handed a mirror
 * rather than fetching one. Nothing here reaches TMDB, Google or Better Auth.
 */

setUpTestDatabase("mediasafe_remove_from_library_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface Show {
  readonly titleId: string;
  readonly episodeId: string;
  readonly name: string;
}

/** A show with one episode, in the global catalogue and owned by nobody. */
async function seedShow(tx: Transaction): Promise<Show> {
  const number = nextNumber();
  const name = `Show ${number}`;
  const [row] = await tx
    .insert(title)
    .values({ kind: "show", tmdbId: number, name, releaseYear: 2019, inProduction: true })
    .returning({ id: title.id });

  const [one] = await tx
    .insert(episode)
    .values({
      titleId: row.id,
      tmdbEpisodeId: nextNumber() + 500_000,
      seasonNo: 1,
      episodeNo: 1,
      name: `S1E1 of ${number}`,
      airDate: "2019-01-01",
    })
    .returning({ id: episode.id });

  return { titleId: row.id, episodeId: one.id, name };
}

interface EntrySpec {
  readonly rating?: number;
  readonly watches?: number;
}

/** One account's relationship with one title: the entry, its rating, and its watches. */
async function seedEntry(
  tx: Transaction,
  userId: UserId,
  show: Show,
  spec: EntrySpec = {},
): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: show.titleId, rating: spec.rating ?? null })
    .returning({ id: libraryEntry.id });

  for (let index = 0; index < (spec.watches ?? 0); index += 1) {
    await tx.insert(watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId: show.titleId,
      episodeId: show.episodeId,
      watchedAt: new Date(),
      source: "app",
      sourceKey: `click-${nextNumber()}`,
    });
  }

  return entry.id;
}

/** A show mirror in the shape `tmdb/mirror.ts` produces — the real add's only input. */
function showMirrorFixture(): TitleMirror {
  const tmdbId = nextNumber() + 700_000;
  return {
    kind: "show",
    tmdbId,
    externalId: `tvdb:${tmdbId}`,
    name: `Mirrored ${tmdbId}`,
    releaseYear: 2015,
    posterPath: "/poster.jpg",
    inProduction: false,
    runtimeMins: null,
    episodes: [
      {
        tmdbEpisodeId: nextNumber() + 900_000,
        seasonNo: 1,
        episodeNo: 1,
        name: "The First One",
        airDate: "2015-04-17",
        runtimeMins: 48,
      },
    ],
  };
}

describe("the numbers the confirmation states", () => {
  it("counts that title's watches and reports its rating", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const entryId = await seedEntry(tx, reader, show, { rating: 8, watches: 5 });

      expect(await titleFootprint(reader, entryId, tx)).toEqual({
        name: show.name,
        watches: 5,
        rating: 8,
      });
    });
  });

  /**
   * The pairing that makes *never a zero* meaningful. A title with nothing behind it
   * reads as zero watches and no rating **because the read succeeded** — which is only a
   * distinction worth drawing because the other branch, a read that failed, throws
   * instead of arriving here as the same shape.
   */
  it("reads an untouched entry as no watches and no rating", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const entryId = await seedEntry(tx, reader, show);

      expect(await titleFootprint(reader, entryId, tx)).toEqual({
        name: show.name,
        watches: 0,
        rating: null,
      });
    });
  });

  it("never counts another account's watches of the same title", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const shared = await seedShow(tx);

      const mine = await seedEntry(tx, reader, shared, { rating: 3, watches: 2 });
      const theirs = await seedEntry(tx, other, shared, { rating: 9, watches: 11 });

      expect(await titleFootprint(reader, mine, tx)).toEqual({
        name: shared.name,
        watches: 2,
        rating: 3,
      });
      expect(await titleFootprint(other, theirs, tx)).toEqual({
        name: shared.name,
        watches: 11,
        rating: 9,
      });
    });
  });

  it("never counts another title's watches in the same library", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const going = await seedShow(tx);
      const staying = await seedShow(tx);

      const entryId = await seedEntry(tx, reader, going, { watches: 1 });
      await seedEntry(tx, reader, staying, { rating: 10, watches: 40 });

      expect(await titleFootprint(reader, entryId, tx)).toEqual({
        name: going.name,
        watches: 1,
        rating: null,
      });
    });
  });

  /**
   * A tampered id and a stale one are the same case from here, exactly as they are for
   * `getTitleDetail` and `abandonTitle`: both are a throw rather than a footprint of
   * zeroes, because a page that cannot count what it is about to destroy must show a read
   * failure and no confirmation under it.
   */
  it("refuses an entry that belongs to another account", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx);
      const theirs = await seedEntry(tx, other, show, { watches: 3 });

      await expect(titleFootprint(reader, theirs, tx)).rejects.toThrow();
    });
  });

  it("refuses an entry id that names nothing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await expect(
        titleFootprint(reader, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    });
  });
});

describe("removing the title", () => {
  it("removes the entry and every watch of that title", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const entryId = await seedEntry(tx, reader, show, { rating: 7, watches: 6 });

      await removeTitleFromLibrary(reader, entryId, tx);

      expect(
        await tx.select().from(libraryEntry).where(eq(libraryEntry.id, entryId)),
      ).toEqual([]);
      expect(await tx.select().from(watch).where(eq(watch.libraryEntryId, entryId))).toEqual(
        [],
      );
    });
  });

  /**
   * The assertion nothing on any screen would make for you. `title` and `episode` are
   * global and unowned (ADR-0001) — a cascade that reached them would empty every other
   * account's library, silently, the first time somebody tidied up their own.
   */
  it("leaves the global title and episode rows standing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const entryId = await seedEntry(tx, reader, show, { watches: 2 });

      await removeTitleFromLibrary(reader, entryId, tx);

      expect(await tx.select().from(title).where(eq(title.id, show.titleId))).toHaveLength(1);
      expect(
        await tx.select().from(episode).where(eq(episode.id, show.episodeId)),
      ).toHaveLength(1);
    });
  });

  it("leaves every other title's entry and watches standing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const going = await seedShow(tx);
      const staying = await seedShow(tx);

      const removed = await seedEntry(tx, reader, going, { watches: 3 });
      const kept = await seedEntry(tx, reader, staying, { rating: 5, watches: 4 });

      await removeTitleFromLibrary(reader, removed, tx);

      expect(await tx.select().from(libraryEntry).where(eq(libraryEntry.id, kept))).toHaveLength(
        1,
      );
      expect(await tx.select().from(watch).where(eq(watch.libraryEntryId, kept))).toHaveLength(4);
    });
  });

  it("leaves another account's entry for the same title untouched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const shared = await seedShow(tx);

      const mine = await seedEntry(tx, reader, shared, { watches: 1 });
      const theirs = await seedEntry(tx, other, shared, { rating: 9, watches: 8 });

      await removeTitleFromLibrary(reader, mine, tx);

      const [kept] = await tx.select().from(libraryEntry).where(eq(libraryEntry.id, theirs));
      expect(kept.rating).toBe(9);
      expect(await tx.select().from(watch).where(eq(watch.libraryEntryId, theirs))).toHaveLength(
        8,
      );
    });
  });

  it("refuses an entry that belongs to another account, and removes nothing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx);
      const theirs = await seedEntry(tx, other, show, { watches: 3 });

      await expect(removeTitleFromLibrary(reader, theirs, tx)).rejects.toThrow();

      expect(await tx.select().from(libraryEntry).where(eq(libraryEntry.id, theirs))).toHaveLength(
        1,
      );
      expect(await tx.select().from(watch).where(eq(watch.libraryEntryId, theirs))).toHaveLength(
        3,
      );
    });
  });

  /**
   * The counts the page stated, against the rows the database actually lost — whole-table
   * counts, unscoped for the reason `tests/delete-account.test.ts` gives for its own:
   * after the delete, a scope narrowed to the removed entry is empty whatever else the
   * statement took with it.
   */
  it("destroys exactly the numbers the confirmation stated", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const going = await seedShow(tx);
      const staying = await seedShow(tx);

      const entryId = await seedEntry(tx, reader, going, { rating: 6, watches: 5 });
      await seedEntry(tx, reader, staying, { rating: 2, watches: 7 });
      await seedEntry(tx, other, going, { rating: 4, watches: 9 });

      const stated = await titleFootprint(reader, entryId, tx);

      const entriesBefore = await countEntries(tx);
      const watchesBefore = await countWatches(tx);
      const ratingsBefore = await countRatings(tx);

      await removeTitleFromLibrary(reader, entryId, tx);

      expect({
        entries: entriesBefore - (await countEntries(tx)),
        watches: watchesBefore - (await countWatches(tx)),
        ratings: ratingsBefore - (await countRatings(tx)),
      }).toEqual({
        entries: 1,
        watches: stated.watches,
        ratings: stated.rating === null ? 0 : 1,
      });
    });
  });

  it("takes the rating with it, and only that entry's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const going = await seedShow(tx);
      const staying = await seedShow(tx);

      const entryId = await seedEntry(tx, reader, going, { rating: 10 });
      const kept = await seedEntry(tx, reader, staying, { rating: 1 });

      await removeTitleFromLibrary(reader, entryId, tx);

      const rated = await tx.select().from(libraryEntry).where(isNotNull(libraryEntry.rating));
      expect(rated.map((row) => row.id)).toEqual([kept]);
    });
  });

  /**
   * *Removing is not a ban* (issue #133, user story 17). The global rows survived, so the
   * add finds them rather than re-mirroring into a duplicate — and the entry it mints is
   * a new one with no watches behind it, which is what the state view calls a watchlist
   * title. Nothing here asserts that rule a second time; it reads it from the view.
   */
  it("lets the title be added again, arriving on the watchlist", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const mirror = showMirrorFixture();

      await addTitleToLibrary(reader, mirror, tx);
      const [first] = await tx
        .select({ id: libraryEntry.id, titleId: libraryEntry.titleId })
        .from(libraryEntry)
        .where(ownedBy(reader, libraryEntry));

      const [only] = await tx
        .select({ id: episode.id })
        .from(episode)
        .where(eq(episode.titleId, first.titleId));
      await tx.insert(watch).values({
        userId: reader,
        libraryEntryId: first.id,
        titleId: first.titleId,
        episodeId: only.id,
        watchedAt: new Date(),
        source: "app",
        sourceKey: `click-${nextNumber()}`,
      });

      await removeTitleFromLibrary(reader, first.id, tx);

      expect(await addTitleToLibrary(reader, mirror, tx)).toEqual({ added: true });

      const [again] = await tx
        .select({ id: libraryEntry.id, titleId: libraryEntry.titleId })
        .from(libraryEntry)
        .where(ownedBy(reader, libraryEntry));
      expect(again.titleId).toBe(first.titleId);
      expect(again.id).not.toBe(first.id);

      const [state] = await tx
        .select({ state: libraryEntryState.state })
        .from(libraryEntryState)
        .where(eq(libraryEntryState.libraryEntryId, again.id));
      expect(state.state).toBe("watchlist");
    });
  });
});

/**
 * The one decision in issue #133 this ticket does **not** deliver, pinned so that the day it
 * is delivered, it is delivered on purpose.
 *
 * #133, *Removing a show leaves its list entries — decided here*: "a list entry survives the
 * library entry going. That is intended: a list is your own grouping, not a view of your
 * library, and one action must not silently edit a list you ordered by hand."
 *
 * Today it does not survive. `list_membership`'s composite foreign key points at
 * `library_entry` and cascades (`db/tables.ts`), so this `DELETE` takes the memberships with
 * it. The change that fixes it is the repoint of that key from `library_entry` to `title`,
 * which is an ADR-0001 amendment and belongs to the lists ticket rather than this one; the
 * table has zero rows in production, so nothing is lost meanwhile.
 *
 * **This test asserts the wrong behaviour on purpose.** It is a tripwire, not an
 * endorsement: it passes only while the cascade is still there, so the repoint cannot land
 * without this file failing and putting the decision in front of whoever lands it. Delete it
 * in the same change that repoints the key, and replace it with the assertion #133 actually
 * asks for — that the membership is still standing afterwards.
 */
describe("list memberships, until the repoint issue #133 decided", () => {
  it("still go with the entry today — the tripwire for that change", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const entryId = await seedEntry(tx, reader, show, { watches: 1 });

      const [owned] = await tx
        .insert(list)
        .values({ userId: reader, name: "Comfort shows" })
        .returning({ id: list.id });
      await tx
        .insert(listMembership)
        .values({ listId: owned.id, libraryEntryId: entryId, userId: reader, position: 1 });

      await removeTitleFromLibrary(reader, entryId, tx);

      expect(
        await tx
          .select()
          .from(listMembership)
          .where(eq(listMembership.libraryEntryId, entryId)),
      ).toEqual([]);
      // The list itself is untouched either way — it is owned by the account, not by the
      // entry, and nothing about removing one title deletes a grouping.
      expect(await tx.select().from(list).where(eq(list.id, owned.id))).toHaveLength(1);
    });
  });
});

/** Whole-table counts — see the assertion above for why they are unscoped. */
async function countEntries(tx: Transaction): Promise<number> {
  return (await tx.select().from(libraryEntry)).length;
}

async function countWatches(tx: Transaction): Promise<number> {
  return (await tx.select().from(watch)).length;
}

async function countRatings(tx: Transaction): Promise<number> {
  return (await tx.select().from(libraryEntry).where(isNotNull(libraryEntry.rating))).length;
}
