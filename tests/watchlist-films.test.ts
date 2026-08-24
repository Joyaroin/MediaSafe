import { describe, expect, it } from "vitest";

import {
  asUserId,
  listWatchlistFilms,
  type LibraryStateGroupEntry,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * `listWatchlistFilms` (issue #250) — the landing screen's second rail, and the one read
 * behind it.
 *
 * It replaces `listWatchlist` and `listAbandoned` (#138), whose phone groups #250 deleted.
 * Everything those two proved about *watchlist* membership is still proved here, because it
 * is the same `library_entry_state` predicate; what is new is the second predicate, and it
 * is the one worth the file: **a film, and not a show.** Get that wrong and the rail still
 * renders, still holds cards, and offers a reader a television series under the words
 * *Films to watch*.
 *
 * ── Why this is not `up-next.test.ts` ─────────────────────────────────────────────────
 *
 * This rail carries no `SPEC.md` §7 ordering — that rule is about *up next*, and a
 * watchlist film has neither a watch to be recent nor a next episode to be dated. So this
 * file checks a different, smaller thing: which titles the rail holds, ordered Title A–Z,
 * and that a **film** — which `up-next.test.ts`'s membership never has to reason about,
 * because no film is ever *watching* or *caught up* — is not silently dropped by a query
 * that assumed a show.
 *
 * ── No network, and nothing mocked ───────────────────────────────────────────────────
 *
 * Every row below is inserted directly through the harness's transaction, the same way
 * `up-next.test.ts` and `library-grid.test.ts` do.
 */

setUpTestDatabase("mediasafe_watchlist_films_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

interface Entry {
  userId: UserId;
  titleId: string;
  entryId: string;
}

interface EntrySpec {
  name?: string;
  kind?: "film" | "show";
  releaseYear?: number | null;
  posterPath?: string | null;
  runtimeMins?: number | null;
  abandonedAt?: Date;
}

/** A library entry with no episodes — nothing here needs one to be *watchlist*. */
async function seedEntry(
  tx: Transaction,
  userId: UserId,
  spec: EntrySpec = {},
): Promise<Entry> {
  const number = nextNumber();
  const kind = spec.kind ?? "film";
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId: number,
      name: spec.name ?? `Title ${number}`,
      releaseYear: "releaseYear" in spec ? spec.releaseYear : 2019,
      posterPath: "posterPath" in spec ? spec.posterPath : `/poster-${number}.jpg`,
      runtimeMins:
        "runtimeMins" in spec ? spec.runtimeMins : kind === "film" ? 104 : null,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandonedAt })
    .returning({ id: libraryEntry.id });

  return { userId, titleId: row.id, entryId: entry.id };
}

async function markWatched(tx: Transaction, entry: Entry): Promise<void> {
  await tx.insert(watch).values({
    userId: entry.userId,
    libraryEntryId: entry.entryId,
    titleId: entry.titleId,
    episodeId: null,
    watchedAt: new Date(),
    source: "app",
    sourceKey: `test-${nextNumber()}`,
  });
}

function names(entries: readonly LibraryStateGroupEntry[]): string[] {
  return entries.map((entry) => entry.titleName);
}

describe("listWatchlistFilms", () => {
  it("holds a film with no watches at all", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Unstarted film", kind: "film" });

      expect(names(await listWatchlistFilms(reader, tx))).toEqual(["Unstarted film"]);
    });
  });

  /**
   * The predicate this file exists for. A show on the watchlist is a real and common thing
   * — it is what *added, never started* means for television — and it belongs on the
   * library's status filters, not under *Films to watch*.
   */
  it("leaves out a show on the watchlist, however unstarted", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Unstarted show", kind: "show" });
      await seedEntry(tx, reader, { name: "Unstarted film", kind: "film" });

      expect(names(await listWatchlistFilms(reader, tx))).toEqual(["Unstarted film"]);
    });
  });

  it("leaves out a film the moment it has any watch", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const started = await seedEntry(tx, reader, { name: "Started" });
      await markWatched(tx, started);
      await seedEntry(tx, reader, { name: "Unstarted" });

      expect(names(await listWatchlistFilms(reader, tx))).toEqual(["Unstarted"]);
    });
  });

  it("leaves out an abandoned film that has never been watched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      // No watches at all, but abandoned outranks *watchlist* — the same precedence
      // `library_entry_state` gives every other derived state (`db/views.ts`).
      await seedEntry(tx, reader, { name: "Given up cold", abandonedAt: new Date() });
      await seedEntry(tx, reader, { name: "Unstarted" });

      expect(names(await listWatchlistFilms(reader, tx))).toEqual(["Unstarted"]);
    });
  });

  it("returns this account's entries and never another account's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const stranger = await seedUser(tx, "stranger");
      await seedEntry(tx, reader, { name: "Mine" });
      await seedEntry(tx, stranger, { name: "Theirs" });

      expect(names(await listWatchlistFilms(reader, tx))).toEqual(["Mine"]);
    });
  });

  /**
   * An empty array here is what makes the rail *absent* rather than *broken*: it is
   * reachable only from a query that succeeded and found nothing, and a read that fails
   * throws past every rail into the route's `error.tsx` (`AGENTS.md`).
   */
  it("answers an account with no watchlist films with an empty array", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const started = await seedEntry(tx, reader, { name: "Started" });
      await markWatched(tx, started);
      await seedEntry(tx, reader, { name: "A show nobody started", kind: "show" });

      expect(await listWatchlistFilms(reader, tx)).toEqual([]);
    });
  });

  it("orders Title A–Z, and gives two identical loads an identical order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, { name: "Zebra" });
      await seedEntry(tx, reader, { name: "anvil" });
      // Two share a name, so only the entry id underneath can separate them — the same
      // tiebreak `db/library-sort.ts`'s Title A–Z sort carries.
      await seedEntry(tx, reader, { name: "Bell" });
      await seedEntry(tx, reader, { name: "Bell" });

      const first = await listWatchlistFilms(reader, tx);
      const second = await listWatchlistFilms(reader, tx);

      expect(first).toEqual(second);
      expect(names(first)).toEqual(["anvil", "Bell", "Bell", "Zebra"]);
    });
  });

  /**
   * The whole row, asserted as a whole. The runtime is the field #250 added — the film
   * card's `year · runtime` line needs it — and asserting the object rather than the one
   * key is what would catch a column quietly arriving beside it.
   */
  it("carries everything a film card renders, and nothing an episode would", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const entry = await seedEntry(tx, reader, {
        name: "Arrival",
        kind: "film",
        releaseYear: 2016,
        posterPath: "/arrival.jpg",
        runtimeMins: 116,
      });

      const [row] = await listWatchlistFilms(reader, tx);

      expect(row).toEqual({
        libraryEntryId: entry.entryId,
        titleId: entry.titleId,
        titleName: "Arrival",
        releaseYear: 2016,
        posterPath: "/arrival.jpg",
        runtimeMins: 116,
      });
    });
  });

  /** Both absences are the answer rather than an error, and `titleMetaLine` drops the part
   *  it does not have rather than placeholding it (`up-next-film-rail.tsx`). */
  it("carries the absences TMDB really has", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await seedEntry(tx, reader, {
        name: "Undated",
        releaseYear: null,
        posterPath: null,
        runtimeMins: null,
      });

      const [row] = await listWatchlistFilms(reader, tx);

      expect(row.releaseYear).toBeNull();
      expect(row.posterPath).toBeNull();
      expect(row.runtimeMins).toBeNull();
    });
  });
});
