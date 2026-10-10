import { describe, expect, it } from "vitest";

import {
  asUserId,
  calendarFeedOwner,
  listCalendarFeed,
  renewCalendarFeedToken,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The calendar feed's reads and its one write — issue #366, against a real database.
 *
 * Two properties matter and both fail silently: the feed's membership (a calendar that
 * holds another reader's shows, or quietly drops a premiere, raises no error), and the
 * token (a replaced token that still answers is a URL the reader believes they revoked).
 */

setUpTestDatabase("mediasafe_calendar_feed_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const LAST_WEEK = daysFromToday(-7);
const SOON = daysFromToday(10);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/**
 * A show in `userId`'s library with one aired episode and one dated `SOON`, plus whatever
 * else is asked for. `watched` puts it at *watching*; without it the show is *watchlist*.
 */
async function seedShow(
  tx: Transaction,
  userId: UserId,
  name: string,
  spec: { watched?: boolean; abandoned?: boolean; special?: boolean } = {},
): Promise<void> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({ kind: "show", tmdbId: number, name, releaseYear: 2024, inProduction: true })
    .returning({ id: title.id });

  const [aired] = await tx
    .insert(episode)
    .values({ titleId: row.id, tmdbEpisodeId: number * 10, seasonNo: 1, episodeNo: 1, airDate: LAST_WEEK })
    .returning({ id: episode.id });

  await tx.insert(episode).values({
    titleId: row.id,
    tmdbEpisodeId: number * 10 + 1,
    seasonNo: spec.special ? 0 : 1,
    episodeNo: 2,
    name: `${name} next`,
    airDate: SOON,
  });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandoned ? new Date() : undefined })
    .returning({ id: libraryEntry.id });

  if (spec.watched || spec.abandoned) {
    await tx.insert(watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId: row.id,
      episodeId: aired.id,
      watchedAt: new Date(),
      source: "app",
      sourceKey: `test-${nextNumber()}`,
    });
  }
}

async function seedFilm(
  tx: Transaction,
  userId: UserId,
  name: string,
  releaseDate: string | null,
): Promise<string> {
  const [row] = await tx
    .insert(title)
    .values({ kind: "film", tmdbId: nextNumber(), name, releaseYear: 2026, releaseDate })
    .returning({ id: title.id });
  await tx.insert(libraryEntry).values({ userId, titleId: row.id });
  return row.id;
}

describe("listCalendarFeed", () => {
  it("holds every upcoming episode of a show in the library, started or not", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "feed-shows");
      await seedShow(tx, reader, "Watching", { watched: true });
      await seedShow(tx, reader, "Queued");

      const { episodes } = await listCalendarFeed(reader, tx);

      expect(episodes.map((row) => [row.titleName, row.airDate, row.episodeName])).toEqual([
        ["Queued", SOON, "Queued next"],
        ["Watching", SOON, "Watching next"],
      ]);
    });
  });

  it("leaves out aired episodes, specials, and shows the reader stopped", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "feed-left-out");
      await seedShow(tx, reader, "Stopped", { abandoned: true });
      await seedShow(tx, reader, "Special", { watched: true, special: true });

      expect((await listCalendarFeed(reader, tx)).episodes).toEqual([]);
    });
  });

  it("holds unreleased films and leaves out released and undated ones", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "feed-films");
      const titleId = await seedFilm(tx, reader, "Coming", SOON);
      await seedFilm(tx, reader, "Out already", LAST_WEEK);
      await seedFilm(tx, reader, "Undated", null);

      const { films } = await listCalendarFeed(reader, tx);

      expect(films).toEqual([
        expect.objectContaining({ titleId, titleName: "Coming", releaseDate: SOON }),
      ]);
    });
  });

  it("holds nothing from another reader's library", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "feed-owner");
      const other = await seedUser(tx, "feed-other");
      await seedShow(tx, other, "Theirs", { watched: true });
      await seedFilm(tx, other, "Their film", SOON);

      expect(await listCalendarFeed(reader, tx)).toEqual({ episodes: [], films: [] });
    });
  });
});

describe("the feed token", () => {
  it("answers to its owner, and to nobody before one is made", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "token-owner");
      const other = await seedUser(tx, "token-other");

      const readerToken = await renewCalendarFeedToken(reader, tx);
      const otherToken = await renewCalendarFeedToken(other, tx);

      expect(readerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(otherToken).not.toBe(readerToken);
      expect(await calendarFeedOwner(readerToken, tx)).toBe(reader);
      expect(await calendarFeedOwner(otherToken, tx)).toBe(other);
      expect(await calendarFeedOwner("b".repeat(43), tx)).toBeNull();
    });
  });

  it("stops answering to the old token once a new link is made", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "token-renew");

      const first = await renewCalendarFeedToken(reader, tx);
      const second = await renewCalendarFeedToken(reader, tx);

      expect(second).not.toBe(first);
      expect(await calendarFeedOwner(first, tx)).toBeNull();
      expect(await calendarFeedOwner(second, tx)).toBe(reader);
    });
  });
});
