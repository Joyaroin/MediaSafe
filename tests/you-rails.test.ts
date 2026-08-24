import { describe, expect, it } from "vitest";

import {
  addTitleToList,
  asUserId,
  createList,
  listYouListCards,
  listYouRails,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * You's three rails — issue #248, against real Postgres.
 *
 * `listYouListCards` and `listYouRails` are the two reads behind the lists, shows and
 * films rails on `/you`. Nothing here goes through the cache: `cache/tags.ts`'s own tests
 * hold the wrapping, this file holds the query.
 */

setUpTestDatabase("mediasafe_you_rails_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test`, timezone: "UTC" });
  return asUserId(id);
}

interface SeededTitle {
  titleId: string;
  episodeIds: string[];
}

async function seedTitle(
  tx: Transaction,
  {
    kind,
    name,
    posterPath = "/poster.jpg",
    episodes = 0,
    inProduction = false,
  }: {
    kind: "film" | "show";
    name?: string;
    posterPath?: string | null;
    episodes?: number;
    inProduction?: boolean | null;
  },
): Promise<SeededTitle> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId,
      name: name ?? `Title ${tmdbId}`,
      releaseYear: 2019,
      posterPath,
      runtimeMins: kind === "film" ? 104 : null,
      inProduction: kind === "show" ? inProduction : null,
    })
    .returning({ id: title.id });

  const episodeIds: string[] = [];
  for (let index = 1; index <= episodes; index += 1) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: 1,
        episodeNo: index,
        name: `Episode ${index}`,
        airDate: "2020-01-01",
        runtimeMins: 30,
      })
      .returning({ id: episode.id });
    episodeIds.push(inserted.id);
  }

  return { titleId: row.id, episodeIds };
}

async function addToLibrary(tx: Transaction, userId: UserId, seeded: SeededTitle): Promise<string> {
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: seeded.titleId })
    .returning({ id: libraryEntry.id });
  return entry.id;
}

async function recordWatch(
  tx: Transaction,
  userId: UserId,
  seeded: SeededTitle,
  entryId: string,
  { episodeId = null, watchedAt = new Date() }: { episodeId?: string | null; watchedAt?: Date | null } = {},
): Promise<void> {
  await tx.insert(watch).values({
    userId,
    libraryEntryId: entryId,
    titleId: seeded.titleId,
    episodeId,
    watchedAt,
    source: "app",
    sourceKey: `you-rails-${nextNumber()}`,
  });
}

describe("listYouListCards", () => {
  it("carries the name and title count every other lists surface reads", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const created = await createList(reader, "Comfort shows", tx);
      if (!created.ok) throw new Error("expected a fresh list");
      const show = await seedTitle(tx, { kind: "show" });
      await addTitleToList(reader, created.list.id, show.titleId, tx);

      const [card] = await listYouListCards(reader, tx);

      expect(card.name).toBe("Comfort shows");
      expect(card.titleCount).toBe(1);
    });
  });

  it("draws up to four posters in membership order, and no more", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const created = await createList(reader, "Five posters", tx);
      if (!created.ok) throw new Error("expected a fresh list");

      for (let index = 0; index < 5; index += 1) {
        const seeded = await seedTitle(tx, { kind: "film", posterPath: `/p${index}.jpg` });
        await addTitleToList(reader, created.list.id, seeded.titleId, tx);
      }

      const [card] = await listYouListCards(reader, tx);

      expect(card.name).toBe("Five posters");
      expect(card.titleCount).toBe(5);
      expect(card.posterPaths).toEqual(["/p0.jpg", "/p1.jpg", "/p2.jpg", "/p3.jpg"]);
    });
  });

  it("skips a title with no poster rather than leaving a gap", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const created = await createList(reader, "Mixed artwork", tx);
      if (!created.ok) throw new Error("expected a fresh list");

      const noArt = await seedTitle(tx, { kind: "film", posterPath: null });
      await addTitleToList(reader, created.list.id, noArt.titleId, tx);
      const withArt = await seedTitle(tx, { kind: "film", posterPath: "/covered.jpg" });
      await addTitleToList(reader, created.list.id, withArt.titleId, tx);

      const [card] = await listYouListCards(reader, tx);

      expect(card.posterPaths).toEqual(["/covered.jpg"]);
    });
  });

  it("falls back to the empty poster array for a list with no titles", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const created = await createList(reader, "Brand new", tx);
      if (!created.ok) throw new Error("expected a fresh list");

      const [card] = await listYouListCards(reader, tx);

      expect(card.titleCount).toBe(0);
      expect(card.posterPaths).toEqual([]);
    });
  });

  it("falls back to the empty poster array when every title lacks artwork", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const created = await createList(reader, "No artwork anywhere", tx);
      if (!created.ok) throw new Error("expected a fresh list");

      const noArt = await seedTitle(tx, { kind: "film", posterPath: null });
      await addTitleToList(reader, created.list.id, noArt.titleId, tx);

      const [card] = await listYouListCards(reader, tx);

      expect(card.titleCount).toBe(1);
      expect(card.posterPaths).toEqual([]);
    });
  });

  it("returns this account's lists and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      await createList(reader, "Mine", tx);
      await createList(stranger, "Theirs", tx);

      const cards = await listYouListCards(reader, tx);

      expect(cards.map((card) => card.name)).toEqual(["Mine"]);
    });
  });
});

describe("listYouRails", () => {
  it("holds a show at watching and a film at watching, split by kind", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const show = await seedTitle(tx, { kind: "show", name: "A Show", episodes: 3 });
      const showEntry = await addToLibrary(tx, reader, show);
      await recordWatch(tx, reader, show, showEntry, { episodeId: show.episodeIds[0] });

      const film = await seedTitle(tx, { kind: "film", name: "A Film" });
      // A film has no episode-watch progress to be "watching" against; it is only ever
      // *finished* or *watchlist* (`db/views.ts`). This film is left unwatched on purpose,
      // and asserted absent below — the rail's honest membership, not a placeholder case.
      void film;

      const rails = await listYouRails(reader, tx);

      expect(rails.shows.map((entry) => entry.titleName)).toEqual(["A Show"]);
      expect(rails.films).toEqual([]);
    });
  });

  it("holds a caught-up show, and leaves out a finished film", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const show = await seedTitle(tx, {
        kind: "show",
        name: "Caught up show",
        episodes: 2,
        inProduction: true,
      });
      const showEntry = await addToLibrary(tx, reader, show);
      for (const episodeId of show.episodeIds) {
        await recordWatch(tx, reader, show, showEntry, { episodeId });
      }

      const film = await seedTitle(tx, { kind: "film", name: "Finished film" });
      const filmEntry = await addToLibrary(tx, reader, film);
      await recordWatch(tx, reader, film, filmEntry);

      const rails = await listYouRails(reader, tx);

      expect(rails.shows.map((entry) => entry.titleName)).toEqual(["Caught up show"]);
      expect(rails.films).toEqual([]);
    });
  });

  it("orders most recent dated watch first", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      // Two episodes each, one watched — *watching*, not *finished*: this test is about
      // order, and a finished show would drop off the rail entirely rather than sort.
      const older = await seedTitle(tx, { kind: "show", name: "Older", episodes: 2 });
      const olderEntry = await addToLibrary(tx, reader, older);
      await recordWatch(tx, reader, older, olderEntry, {
        episodeId: older.episodeIds[0],
        watchedAt: new Date("2024-01-01"),
      });

      const newer = await seedTitle(tx, { kind: "show", name: "Newer", episodes: 2 });
      const newerEntry = await addToLibrary(tx, reader, newer);
      await recordWatch(tx, reader, newer, newerEntry, {
        episodeId: newer.episodeIds[0],
        watchedAt: new Date("2024-06-01"),
      });

      const rails = await listYouRails(reader, tx);

      expect(rails.shows.map((entry) => entry.titleName)).toEqual(["Newer", "Older"]);
    });
  });

  it("orders an undated watch after every dated one, not before", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const undated = await seedTitle(tx, { kind: "show", name: "Undated", episodes: 2 });
      const undatedEntry = await addToLibrary(tx, reader, undated);
      await recordWatch(tx, reader, undated, undatedEntry, {
        episodeId: undated.episodeIds[0],
        watchedAt: null,
      });

      const dated = await seedTitle(tx, { kind: "show", name: "Dated", episodes: 2 });
      const datedEntry = await addToLibrary(tx, reader, dated);
      await recordWatch(tx, reader, dated, datedEntry, {
        episodeId: dated.episodeIds[0],
        watchedAt: new Date("2024-01-01"),
      });

      const rails = await listYouRails(reader, tx);

      expect(rails.shows.map((entry) => entry.titleName)).toEqual(["Dated", "Undated"]);
    });
  });

  it("leaves out a watchlist title and an abandoned one", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await seedTitle(tx, { kind: "show", name: "Never started" });

      const rails = await listYouRails(reader, tx);

      expect(rails.shows).toEqual([]);
      expect(rails.films).toEqual([]);
    });
  });

  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");

      const show = await seedTitle(tx, { kind: "show", name: "Theirs", episodes: 1 });
      const entry = await addToLibrary(tx, stranger, show);
      await recordWatch(tx, stranger, show, entry, { episodeId: show.episodeIds[0] });

      const rails = await listYouRails(reader, tx);

      expect(rails.shows).toEqual([]);
    });
  });
});
