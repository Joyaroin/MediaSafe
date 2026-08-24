import { describe, expect, it } from "vitest";

import { asUserId, listUpcomingFilms, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * **What Upcoming's films half reads** — issue #252, against a real seeded database.
 *
 * `tests/upcoming-episodes.test.ts`'s argument, one section down the same page: the
 * membership rule is what is worth asserting, because getting it wrong is silent in both
 * directions. Too wide and the section counts down to films the reader is not waiting for
 * — a show, a film they finished last year, one that came out on Friday. Too narrow and
 * the thing they opened the page for is simply absent. Nothing throws either way.
 *
 * The cases seeded are the ones the ticket names: a film with no release date, a film with
 * no poster, a film in each of the states that are not *watchlist*, and a show, which is
 * the other section's.
 *
 * **The countdown is not here and must not be.** How many days away a release is belongs
 * to `upcoming-grouping.ts` and is driven directly across a timezone boundary in
 * `tests/upcoming-grouping.test.ts`. This file asks only what the database returns — which
 * includes the one day of slack the read deliberately carries, and that day is asserted
 * here because it is a SQL fact rather than a rendering one.
 */

setUpTestDatabase("mediasafe_upcoming_films_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const LONG_AGO = daysFromToday(-400);
const YESTERDAY = daysFromToday(-1);
const TWO_DAYS_AGO = daysFromToday(-2);
const TODAY = daysFromToday(0);
const SOON = daysFromToday(12);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/**
 * One title and one library entry, with a watch on it only when asked for — which is all
 * `library_entry_state` needs to put a film at *watchlist* or at *finished*. The state is
 * never inserted, because it is a view and there is nothing to insert (ADR-0001).
 */
async function seedTitle(
  tx: Transaction,
  userId: UserId,
  spec: {
    name?: string;
    kind?: "show" | "film";
    releaseDate?: string | null;
    posterPath?: string | null;
    watched?: boolean;
    abandonedAt?: Date;
  },
): Promise<{ entryId: string; titleId: string }> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: spec.kind ?? "film",
      tmdbId: number,
      name: spec.name ?? `Film ${number}`,
      releaseYear: 2026,
      releaseDate: spec.releaseDate === undefined ? SOON : spec.releaseDate,
      posterPath: "posterPath" in spec ? spec.posterPath : "/poster.jpg",
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId, titleId: row.id, abandonedAt: spec.abandonedAt })
    .returning({ id: libraryEntry.id });

  if (spec.watched) {
    await tx.insert(watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId: row.id,
      watchedAt: new Date(),
      source: "app",
      sourceKey: `test-${nextNumber()}`,
    });
  }

  return { entryId: entry.id, titleId: row.id };
}

const namesOf = (rows: readonly { titleName: string }[]) => rows.map((row) => row.titleName);

describe("the membership: on the watchlist, a film, and dated", () => {
  it("lists a watchlist film whose release date is still ahead", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "waiting");
      const { entryId } = await seedTitle(tx, userId, { name: "Hamnet" });

      const rows = await listUpcomingFilms(userId, tx);

      expect(namesOf(rows)).toEqual(["Hamnet"]);
      expect(rows[0].releaseDate).toBe(SOON);
      expect(rows[0].libraryEntryId).toBe(entryId);
      expect(rows[0].posterPath).toBe("/poster.jpg");
    });
  });

  /**
   * The acceptance criterion, and the reason `UpcomingFilm.releaseDate` is not nullable:
   * a film TMDB has announced but not scheduled is the common case on a watchlist, and it
   * must be **absent rather than an error and rather than a card with a blank countdown**.
   */
  it("leaves out a film with no release date, and does not fail on one", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "undated");
      await seedTitle(tx, userId, { name: "Untitled Project", releaseDate: null });
      await seedTitle(tx, userId, { name: "Hamnet" });

      expect(namesOf(await listUpcomingFilms(userId, tx))).toEqual(["Hamnet"]);
    });
  });

  /** A film with no artwork is still a film you are waiting for — the card draws the
   *  missing-artwork treatment, so the row must reach it. */
  it("lists a film with no poster", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "no-poster");
      await seedTitle(tx, userId, { name: "No Art", posterPath: null });

      const rows = await listUpcomingFilms(userId, tx);

      expect(namesOf(rows)).toEqual(["No Art"]);
      expect(rows[0].posterPath).toBeNull();
    });
  });

  /**
   * A film with a watch on it is *finished*, whatever its release date says. A future date
   * on a watched film is a catalogue disagreement rather than an impossibility — a
   * re-release, a festival cut, a correction — and the state is what decides, not the date.
   */
  it("leaves out a film that has been watched", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "watched");
      await seedTitle(tx, userId, { name: "Seen It", watched: true });

      expect(await listUpcomingFilms(userId, tx)).toEqual([]);
    });
  });

  it("leaves out an abandoned film", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "abandoned");
      await seedTitle(tx, userId, { name: "Dropped", abandonedAt: new Date() });

      expect(await listUpcomingFilms(userId, tx)).toEqual([]);
    });
  });

  /**
   * A show's dates are its episodes' and they are the section above this one. A show's own
   * `release_date` is the day its *first* episode went out — for anything in a library
   * that is in the past, so a `kind` predicate is doing real work rather than restating
   * the date one.
   */
  it("leaves out a show on the watchlist, however it is dated", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "show");
      await seedTitle(tx, userId, { name: "Not A Film", kind: "show" });

      expect(await listUpcomingFilms(userId, tx)).toEqual([]);
    });
  });

  it("leaves out another account's watchlist entirely", async () => {
    await inTransaction(async (tx) => {
      const mine = await seedUser(tx, "mine");
      const yours = await seedUser(tx, "yours");
      await seedTitle(tx, yours, { name: "Yours" });

      expect(await listUpcomingFilms(mine, tx)).toEqual([]);
    });
  });
});

describe("the window is a day wider than the server's day", () => {
  /**
   * `release_date >= current_date - 1`, and the extra day is a timezone rather than a
   * fudge: no zone on earth is more than 24 hours from UTC, so a window opening a day
   * early is a superset of *today or later* for every reader at every instant. The reader
   * in Honolulu for whom the server's yesterday is still this evening is exactly the
   * reader a bare `>= current_date` would show an empty section to.
   *
   * `awaitedFilms` narrows this to the reader's actual today, in their own zone, once. So
   * yesterday's row **is** returned here and **is not** rendered there, and that split is
   * deliberate on both sides.
   */
  it("returns yesterday's release and drops the day before it", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "window");
      await seedTitle(tx, userId, { name: "Yesterday", releaseDate: YESTERDAY });
      await seedTitle(tx, userId, { name: "Two days ago", releaseDate: TWO_DAYS_AGO });
      await seedTitle(tx, userId, { name: "Long ago", releaseDate: LONG_AGO });

      expect(namesOf(await listUpcomingFilms(userId, tx))).toEqual(["Yesterday"]);
    });
  });

  it("returns a film released today", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "out-today");
      await seedTitle(tx, userId, { name: "Out Today", releaseDate: TODAY });

      expect(namesOf(await listUpcomingFilms(userId, tx))).toEqual(["Out Today"]);
    });
  });
});

describe("the order", () => {
  /** Soonest first, because the countdown under the first card should be the smallest
   *  number on the rail. */
  it("puts the nearest release first", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "order");
      await seedTitle(tx, userId, { name: "Furthest", releaseDate: daysFromToday(300) });
      await seedTitle(tx, userId, { name: "Nearest", releaseDate: daysFromToday(2) });
      await seedTitle(tx, userId, { name: "Middle", releaseDate: daysFromToday(40) });

      expect(namesOf(await listUpcomingFilms(userId, tx))).toEqual([
        "Nearest",
        "Middle",
        "Furthest",
      ]);
    });
  });

  /** Two films released on one day are ordered by name, case-insensitively, so two
   *  identical loads give an identical section. */
  it("breaks a tie on the same day by name, ignoring case", async () => {
    await inTransaction(async (tx) => {
      const userId = await seedUser(tx, "tie");
      await seedTitle(tx, userId, { name: "banana", releaseDate: SOON });
      await seedTitle(tx, userId, { name: "Apple", releaseDate: SOON });
      await seedTitle(tx, userId, { name: "Cherry", releaseDate: SOON });

      expect(namesOf(await listUpcomingFilms(userId, tx))).toEqual([
        "Apple",
        "banana",
        "Cherry",
      ]);
    });
  });
});
