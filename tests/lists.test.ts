import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToList,
  addTitlesToList,
  asUserId,
  createList,
  createListAndAddTitle,
  deleteList,
  getListDetail,
  listLists,
  ownedBy,
  removeTitleFromLibrary,
  removeTitleFromList,
  renameList,
  reorderListMembership,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, list, listMembership, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The Lists destination's lifecycle, against real Postgres — issue #146.
 *
 * `Adding titles, ordering and dragging are not in this ticket; they arrive next` — so
 * every assertion below is about a list's own row and its membership rows as a whole,
 * never about what one membership contains. Memberships are still seeded directly here,
 * the same way `delete-account.test.ts`'s `seedList` does, because deleting a list's
 * cascade onto `list_membership` is exactly what this ticket's acceptance criteria ask to
 * be proven, even though nothing in the product can create a membership yet.
 *
 * No network: `createList`, `deleteList` and `listLists` take a user id the caller
 * already resolved and the harness's own transaction, and reach nothing outside Postgres.
 */

setUpTestDatabase("mediasafe_lists_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/** A show, global and owned by nobody — the same shape `delete-account.test.ts` seeds. */
async function seedShow(tx: Transaction, posterPath: string | null = null): Promise<string> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: true,
      posterPath,
    })
    .returning({ id: title.id });
  return row.id;
}

async function seedMembership(
  tx: Transaction,
  listId: string,
  userId: UserId,
  titleId: string,
  position: number,
): Promise<void> {
  await tx.insert(listMembership).values({ listId, titleId, userId, position });
}

describe("making a list", () => {
  it("creates and names it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const outcome = await createList(reader, "Comfort shows", tx);

      expect(outcome).toMatchObject({
        ok: true,
        list: { name: "Comfort shows", titleCount: 0 },
      });
    });
  });

  it("trims the name before storing and comparing it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      const outcome = await createList(reader, "  Watch with Dad  ", tx);

      expect(outcome).toMatchObject({ ok: true, list: { name: "Watch with Dad" } });
    });
  });

  it("refuses a second list with the same name for the same account", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await createList(reader, "Rewatch", tx);

      const outcome = await createList(reader, "Rewatch", tx);

      expect(outcome).toEqual({ ok: false, reason: "duplicate" });

      const rows = await tx.select().from(list).where(ownedBy(reader, list));
      expect(rows).toHaveLength(1);
    });
  });

  it("lets two different accounts each have a list with the same name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");

      const first = await createList(reader, "Rewatch", tx);
      const second = await createList(other, "Rewatch", tx);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
    });
  });

  it("rejects an empty or all-whitespace name without writing a row", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await expect(createList(reader, "   ", tx)).rejects.toThrow();

      const rows = await tx.select().from(list).where(ownedBy(reader, list));
      expect(rows).toHaveLength(0);
    });
  });
});

describe("reading the lists back", () => {
  it("orders them alphabetically, case-insensitively", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      await createList(reader, "Watchlist for Dad", tx);
      await createList(reader, "abandoned but curious", tx);
      await createList(reader, "Best of 2025", tx);

      const names = (await listLists(reader, tx)).map((one) => one.name);

      expect(names).toEqual(["abandoned but curious", "Best of 2025", "Watchlist for Dad"]);
    });
  });

  it("counts each list's titles, and includes a list with none", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);

      const { list: full } = unwrap(await createList(reader, "Full", tx));
      const { list: empty } = unwrap(await createList(reader, "Empty", tx));
      await seedMembership(tx, full.id, reader, showA, 1);
      await seedMembership(tx, full.id, reader, showB, 2);

      const rows = await listLists(reader, tx);

      expect(rows.find((one) => one.id === full.id)?.titleCount).toBe(2);
      expect(rows.find((one) => one.id === empty.id)?.titleCount).toBe(0);
    });
  });

  /**
   * Charcoal's list cards draw a stack of a list's first three posters (handoff §8.5,
   * issue #402). Seeded with positions out of insertion order, so an answer ordered by
   * anything but `position` fails here.
   */
  it("carries at most three posters per list, in list order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const shows = [];
      for (const path of ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg"]) {
        shows.push(await seedShow(tx, path));
      }

      const { list: four } = unwrap(await createList(reader, "Four", tx));
      await seedMembership(tx, four.id, reader, shows[0], 3);
      await seedMembership(tx, four.id, reader, shows[1], 1);
      await seedMembership(tx, four.id, reader, shows[2], 4);
      await seedMembership(tx, four.id, reader, shows[3], 2);

      const [row] = await listLists(reader, tx);

      expect(row.posters.map((one) => one.posterPath)).toEqual(["/b.jpg", "/d.jpg", "/a.jpg"]);
    });
  });

  it("carries one poster for a list of one, and none for an empty list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, "/one.jpg");

      const { list: one } = unwrap(await createList(reader, "One", tx));
      const { list: empty } = unwrap(await createList(reader, "Empty", tx));
      await seedMembership(tx, one.id, reader, show, 1);

      const rows = await listLists(reader, tx);

      expect(rows.find((row) => row.id === one.id)?.posters).toEqual([
        { posterPath: "/one.jpg", name: expect.stringMatching(/^Show /) },
      ]);
      expect(rows.find((row) => row.id === empty.id)?.posters).toEqual([]);
    });
  });

  it("keeps a title with no artwork in the stack, by name, so the count and the stack agree", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx, null);

      const { list: bare } = unwrap(await createList(reader, "Bare", tx));
      await seedMembership(tx, bare.id, reader, show, 1);

      const [row] = await listLists(reader, tx);

      expect(row.posters).toHaveLength(1);
      expect(row.posters[0].posterPath).toBeNull();
      expect(row.posters[0].name).toMatch(/^Show /);
    });
  });

  it("never stacks another account's posters, even on a list of the same name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx, "/theirs.jpg");

      await createList(reader, "Shared name", tx);
      const { list: theirs } = unwrap(await createList(other, "Shared name", tx));
      await seedMembership(tx, theirs.id, other, show, 1);

      const [row] = await listLists(reader, tx);

      expect(row.posters).toEqual([]);
    });
  });

  it("never returns another account's lists", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      await createList(reader, "Mine", tx);
      await createList(other, "Theirs", tx);

      const rows = await listLists(reader, tx);

      expect(rows.map((one) => one.name)).toEqual(["Mine"]);
    });
  });
});

describe("deleting a list", () => {
  it("removes the list and its memberships, and nothing else", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Gone soon", tx));
      await seedMembership(tx, target.id, reader, show, 1);
      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: show })
        .returning({ id: libraryEntry.id });
      await tx.insert(watch).values({
        userId: reader,
        libraryEntryId: entry.id,
        titleId: show,
        watchedAt: new Date(),
        source: "app",
        sourceKey: `click-${nextNumber()}`,
      });

      await deleteList(reader, target.id, tx);

      const lists = await tx.select().from(list).where(eq(list.id, target.id));
      const memberships = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      const entries = await tx
        .select()
        .from(libraryEntry)
        .where(eq(libraryEntry.id, entry.id));
      const watches = await tx.select().from(watch).where(eq(watch.libraryEntryId, entry.id));
      const titles = await tx.select().from(title).where(eq(title.id, show));

      expect(lists).toHaveLength(0);
      expect(memberships).toHaveLength(0);
      // The library entry, its watch and the global title all survive — a list holds no
      // history at all, and deleting one must not touch any of the three.
      expect(entries).toHaveLength(1);
      expect(watches).toHaveLength(1);
      expect(titles).toHaveLength(1);
    });
  });

  it("leaves every other list of the same account standing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { list: doomed } = unwrap(await createList(reader, "Doomed", tx));
      const { list: kept } = unwrap(await createList(reader, "Kept", tx));

      await deleteList(reader, doomed.id, tx);

      const names = (await listLists(reader, tx)).map((one) => one.name);
      expect(names).toEqual([kept.name]);
    });
  });

  it("refuses to delete another account's list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const { list: theirs } = unwrap(await createList(other, "Theirs", tx));

      await expect(deleteList(reader, theirs.id, tx)).rejects.toThrow();

      const rows = await tx.select().from(list).where(eq(list.id, theirs.id));
      expect(rows).toHaveLength(1);
    });
  });

  it("throws on a list id that names no row", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await expect(
        deleteList(reader, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    });
  });
});

describe("adding a title to a list", () => {
  it("holds a title that is not in the library", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Someday", tx));

      const outcome = await addTitleToList(reader, target.id, show, tx);

      expect(outcome).toEqual({ added: true });
      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      expect(rows).toMatchObject([{ titleId: show, position: 1 }]);
    });
  });

  it("lands each new title at the next deterministic position, without shuffling", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const showC = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "In order", tx));

      const first = await addTitleToList(reader, target.id, showA, tx);
      const second = await addTitleToList(reader, target.id, showB, tx);
      const third = await addTitleToList(reader, target.id, showC, tx);

      expect(first.added).toBe(true);
      expect(second.added).toBe(true);
      expect(third.added).toBe(true);

      const rows = await tx
        .select({ titleId: listMembership.titleId, position: listMembership.position })
        .from(listMembership)
        .where(eq(listMembership.listId, target.id))
        .orderBy(asc(listMembership.position));
      expect(rows).toEqual([
        { titleId: showA, position: 1 },
        { titleId: showB, position: 2 },
        { titleId: showC, position: 3 },
      ]);
    });
  });

  it("is not an error and not a duplicate when the title is already a member", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Once", tx));
      await addTitleToList(reader, target.id, show, tx);

      const second = await addTitleToList(reader, target.id, show, tx);

      expect(second).toEqual({ added: false });
      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].position).toBe(1);
    });
  });

  it("refuses to add to another account's list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx);
      const { list: theirs } = unwrap(await createList(other, "Theirs", tx));

      await expect(addTitleToList(reader, theirs.id, show, tx)).rejects.toThrow();

      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, theirs.id));
      expect(rows).toHaveLength(0);
    });
  });
});

/**
 * Issue #197's write: the whole held selection lands, or none of it does.
 *
 * `tests/bulk-selection.test.ts` proves the browser only ever asks for **one** write.
 * These prove what that one write does when it gets to Postgres — the half that no fake
 * can answer for, because the properties are the primary key, the position uniqueness and
 * the transaction itself — a mock of a constraint tests the mock.
 */
describe("adding several titles to a list at once", () => {
  it("lands the whole set at sequential positions, in the order it was given", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const showC = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Filed", tx));

      const outcome = await addTitlesToList(reader, target.id, [showA, showB, showC], tx);

      expect(outcome).toEqual({ added: 3 });
      const rows = await tx
        .select({ titleId: listMembership.titleId, position: listMembership.position })
        .from(listMembership)
        .where(eq(listMembership.listId, target.id))
        .orderBy(asc(listMembership.position));
      expect(rows).toEqual([
        { titleId: showA, position: 1 },
        { titleId: showB, position: 2 },
        { titleId: showC, position: 3 },
      ]);
    });
  });

  it("appends after what the list already holds, without shuffling it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const alreadyThere = await seedShow(tx);
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Filed", tx));
      await addTitleToList(reader, target.id, alreadyThere, tx);

      await addTitlesToList(reader, target.id, [showA, showB], tx);

      const rows = await tx
        .select({ titleId: listMembership.titleId, position: listMembership.position })
        .from(listMembership)
        .where(eq(listMembership.listId, target.id))
        .orderBy(asc(listMembership.position));
      expect(rows).toEqual([
        { titleId: alreadyThere, position: 1 },
        { titleId: showA, position: 2 },
        { titleId: showB, position: 3 },
      ]);
    });
  });

  it("does not duplicate a title already in the list, and leaves no hole where it would have gone", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const showC = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Filed", tx));
      await addTitleToList(reader, target.id, showB, tx);

      const outcome = await addTitlesToList(reader, target.id, [showA, showB, showC], tx);

      // Two written, not three — and the positions run 1, 2, 3 with nothing skipped over
      // the title that was already a member. `reorderListMembership` depends on that
      // contiguity, so a hole here would be a bug two tickets away.
      expect(outcome).toEqual({ added: 2 });
      const rows = await tx
        .select({ titleId: listMembership.titleId, position: listMembership.position })
        .from(listMembership)
        .where(eq(listMembership.listId, target.id))
        .orderBy(asc(listMembership.position));
      expect(rows).toEqual([
        { titleId: showB, position: 1 },
        { titleId: showA, position: 2 },
        { titleId: showC, position: 3 },
      ]);
    });
  });

  it("writes a title named twice in the same set exactly once", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Filed", tx));

      const outcome = await addTitlesToList(reader, target.id, [show, show], tx);

      expect(outcome).toEqual({ added: 1 });
      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      expect(rows).toHaveLength(1);
    });
  });

  it("writes nothing at all when one title in the set cannot be written", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Filed", tx));

      // A title id that names nothing — `list_membership.title_id` references `title`, so
      // this is rejected the moment the insert reaches Postgres. The property under test
      // is what happens to the other two: nothing.
      const missing = "00000000-0000-0000-0000-000000000000";
      await expect(
        addTitlesToList(reader, target.id, [showA, missing, showB], tx),
      ).rejects.toThrow();

      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      expect(rows).toHaveLength(0);
    });
  });

  it("refuses to add to another account's list, and reads none of its memberships on the way", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx);
      const { list: theirs } = unwrap(await createList(other, "Theirs", tx));
      await addTitleToList(other, theirs.id, show, tx);

      // The title is already in *their* list. An unscoped read of the memberships would
      // find it, decide there was nothing to write, and answer `{ added: 0 }` — a request
      // against somebody else's list reported as a success.
      await expect(addTitlesToList(reader, theirs.id, [show], tx)).rejects.toThrow();

      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, theirs.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(other);
    });
  });

  it("writes nothing and asks Postgres nothing for an empty set", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { list: target } = unwrap(await createList(reader, "Filed", tx));

      expect(await addTitlesToList(reader, target.id, [], tx)).toEqual({ added: 0 });

      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, target.id));
      expect(rows).toHaveLength(0);
    });
  });
});

describe("making a list from the same action that adds a title", () => {
  it("creates the list and adds the title in one write", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);

      const outcome = await createListAndAddTitle(reader, "Watch with Dad", show, tx);

      expect(outcome).toMatchObject({ ok: true, list: { name: "Watch with Dad" } });
      if (!outcome.ok) throw new Error("unreachable");
      const rows = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.listId, outcome.list.id));
      expect(rows).toMatchObject([{ titleId: show, position: 1 }]);
    });
  });

  it("writes neither the list nor the membership when the name is a duplicate", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      await createList(reader, "Rewatch", tx);

      const outcome = await createListAndAddTitle(reader, "Rewatch", show, tx);

      expect(outcome).toEqual({ ok: false, reason: "duplicate" });
      const lists = await tx.select().from(list).where(ownedBy(reader, list));
      expect(lists).toHaveLength(1);
      const memberships = await tx
        .select()
        .from(listMembership)
        .where(eq(listMembership.titleId, show));
      expect(memberships).toHaveLength(0);
    });
  });
});

describe("reading a list's titles in order", () => {
  it("returns rows in position order, each with its own facts", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const showA = await seedShow(tx);
      const showB = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Ordered", tx));
      await addTitleToList(reader, target.id, showA, tx);
      await addTitleToList(reader, target.id, showB, tx);

      const detail = await getListDetail(reader, target.id, tx);

      expect(detail.name).toBe("Ordered");
      expect(detail.titles.map((one) => one.titleId)).toEqual([showA, showB]);
      expect(detail.titles.map((one) => one.position)).toEqual([1, 2]);
    });
  });

  it("marks a title not in the library with a null library entry id", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Someday", tx));
      await addTitleToList(reader, target.id, show, tx);

      const detail = await getListDetail(reader, target.id, tx);

      expect(detail.titles).toMatchObject([{ titleId: show, libraryEntryId: null }]);
    });
  });

  it("carries the library entry id for a title this account owns", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Mine", tx));
      await addTitleToList(reader, target.id, show, tx);
      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: show })
        .returning({ id: libraryEntry.id });

      const detail = await getListDetail(reader, target.id, tx);

      expect(detail.titles).toMatchObject([{ titleId: show, libraryEntryId: entry.id }]);
    });
  });

  it("refuses to read another account's list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const { list: theirs } = unwrap(await createList(other, "Theirs", tx));

      await expect(getListDetail(reader, theirs.id, tx)).rejects.toThrow();
    });
  });

  it("throws on a list id that names no row", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");

      await expect(
        getListDetail(reader, "00000000-0000-0000-0000-000000000000", tx),
      ).rejects.toThrow();
    });
  });
});

describe("reordering a list by dragging", () => {
  async function seedOrdered(
    tx: Transaction,
    reader: UserId,
    count: number,
  ): Promise<{ listId: string; titleIds: string[] }> {
    const { list: target } = unwrap(await createList(reader, "Ordered", tx));
    const titleIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const show = await seedShow(tx);
      await addTitleToList(reader, target.id, show, tx);
      titleIds.push(show);
    }
    return { listId: target.id, titleIds };
  }

  async function positionsOf(tx: Transaction, listId: string) {
    const rows = await tx
      .select({ titleId: listMembership.titleId, position: listMembership.position })
      .from(listMembership)
      .where(eq(listMembership.listId, listId))
      .orderBy(asc(listMembership.position));
    return rows;
  }

  it("swaps two adjacent rows inside one transaction — the assertion the deferrable unique exists for", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 3);

      await reorderListMembership(reader, listId, titleIds[0], 2, tx);

      expect(await positionsOf(tx, listId)).toEqual([
        { titleId: titleIds[1], position: 1 },
        { titleId: titleIds[0], position: 2 },
        { titleId: titleIds[2], position: 3 },
      ]);
    });
  });

  it("moves a row later, shifting everything between it back by one", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 5);

      await reorderListMembership(reader, listId, titleIds[0], 4, tx);

      expect(await positionsOf(tx, listId)).toEqual([
        { titleId: titleIds[1], position: 1 },
        { titleId: titleIds[2], position: 2 },
        { titleId: titleIds[3], position: 3 },
        { titleId: titleIds[0], position: 4 },
        { titleId: titleIds[4], position: 5 },
      ]);
    });
  });

  it("moves a row earlier, shifting everything between it forward by one", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 5);

      await reorderListMembership(reader, listId, titleIds[4], 2, tx);

      expect(await positionsOf(tx, listId)).toEqual([
        { titleId: titleIds[0], position: 1 },
        { titleId: titleIds[4], position: 2 },
        { titleId: titleIds[1], position: 3 },
        { titleId: titleIds[2], position: 4 },
        { titleId: titleIds[3], position: 5 },
      ]);
    });
  });

  it("leaves positions untouched when the target is the row's own position", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 3);

      await reorderListMembership(reader, listId, titleIds[1], 2, tx);

      expect(await positionsOf(tx, listId)).toEqual([
        { titleId: titleIds[0], position: 1 },
        { titleId: titleIds[1], position: 2 },
        { titleId: titleIds[2], position: 3 },
      ]);
    });
  });

  it("keeps positions contiguous, 1..count, after a reorder", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 6);

      await reorderListMembership(reader, listId, titleIds[5], 1, tx);

      const rows = await positionsOf(tx, listId);
      expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  it("refuses to reorder another account's list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const { listId, titleIds } = await seedOrdered(tx, other, 2);

      await expect(reorderListMembership(reader, listId, titleIds[0], 2, tx)).rejects.toThrow();

      expect(await positionsOf(tx, listId)).toEqual([
        { titleId: titleIds[0], position: 1 },
        { titleId: titleIds[1], position: 2 },
      ]);
    });
  });

  it("throws on a title that is not a member of the list", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId } = await seedOrdered(tx, reader, 2);
      const stray = await seedShow(tx);

      await expect(reorderListMembership(reader, listId, stray, 1, tx)).rejects.toThrow();
    });
  });

  it("throws on a position below 1 or past the list's count", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedOrdered(tx, reader, 3);

      await expect(reorderListMembership(reader, listId, titleIds[0], 0, tx)).rejects.toThrow();
      await expect(reorderListMembership(reader, listId, titleIds[0], 4, tx)).rejects.toThrow();
    });
  });
});

/**
 * The progress a list's posters draw a bar from — `db/access.ts`'s
 * `ListDetailTitleRow.progress`, read at the boundary the list page itself uses.
 *
 * `tests/library-grid.test.ts` already holds the view's own arithmetic (released counted
 * against air date, specials excluded, unaired episodes not counted). What is only true
 * here is the **third absence**: a list holds anything in the catalogue, so a row can have
 * no library entry at all, and that must arrive as the same `null` a film does rather than
 * as a bar at zero. Nothing on the library screen can produce that case.
 */
describe("the progress a list carries for each of its titles", () => {
  function daysFromToday(days: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  async function seedEpisodes(
    tx: Transaction,
    titleId: string,
    specs: readonly { seasonNo: number; airDate: string }[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const [index, one] of specs.entries()) {
      const [row] = await tx
        .insert(episode)
        .values({
          titleId,
          tmdbEpisodeId: nextNumber(),
          seasonNo: one.seasonNo,
          episodeNo: index + 1,
          name: `Episode ${index + 1}`,
          airDate: one.airDate,
        })
        .returning({ id: episode.id });
      ids.push(row.id);
    }
    return ids;
  }

  async function seedFilm(tx: Transaction): Promise<string> {
    const number = nextNumber();
    const [row] = await tx
      .insert(title)
      .values({ kind: "film", tmdbId: number, name: `Film ${number}`, runtimeMins: 104 })
      .returning({ id: title.id });
    return row.id;
  }

  it("counts watched against released for a show this account owns", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      const released = daysFromToday(-30);
      const episodes = await seedEpisodes(tx, show, [
        { seasonNo: 1, airDate: released },
        { seasonNo: 1, airDate: released },
        { seasonNo: 1, airDate: released },
        { seasonNo: 1, airDate: daysFromToday(30) },
      ]);
      const { list: target } = unwrap(await createList(reader, "Comfort shows", tx));
      await addTitleToList(reader, target.id, show, tx);

      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: show })
        .returning({ id: libraryEntry.id });
      await tx.insert(watch).values({
        userId: reader,
        libraryEntryId: entry.id,
        titleId: show,
        episodeId: episodes[0],
        watchedAt: new Date(),
        source: "app",
        sourceKey: `test-${nextNumber()}`,
      });

      const detail = await getListDetail(reader, target.id, tx);

      // Three released, one not — the unaired episode is not part of the denominator, the
      // same fact `library-grid.test.ts` pins for the bill.
      expect(detail.titles[0].progress).toEqual({ watched: 1, released: 3 });
    });
  });

  it("carries none for a title this account does not own — the case only a list has", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const show = await seedShow(tx);
      await seedEpisodes(tx, show, [{ seasonNo: 1, airDate: daysFromToday(-30) }]);
      const { list: target } = unwrap(await createList(reader, "Comfort shows", tx));
      await addTitleToList(reader, target.id, show, tx);

      const detail = await getListDetail(reader, target.id, tx);

      // Episodes exist and are released; what is missing is a library entry to have
      // watched any of them, so there is no fraction to draw and no bar.
      expect(detail.titles[0].libraryEntryId).toBeNull();
      expect(detail.titles[0].progress).toBeNull();
    });
  });

  it("carries none for a film, owned or not", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const owned = await seedFilm(tx);
      const unowned = await seedFilm(tx);
      const { list: target } = unwrap(await createList(reader, "Films", tx));
      await addTitleToList(reader, target.id, owned, tx);
      await addTitleToList(reader, target.id, unowned, tx);
      await tx.insert(libraryEntry).values({ userId: reader, titleId: owned });

      const detail = await getListDetail(reader, target.id, tx);

      expect(detail.titles.map((one) => one.progress)).toEqual([null, null]);
    });
  });

  it("reads another account's watches as none of this account's business", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const show = await seedShow(tx);
      const episodes = await seedEpisodes(tx, show, [
        { seasonNo: 1, airDate: daysFromToday(-30) },
      ]);
      const { list: target } = unwrap(await createList(reader, "Comfort shows", tx));
      await addTitleToList(reader, target.id, show, tx);

      // The other account owns it and has watched it; the reader has not added it at all.
      const [theirs] = await tx
        .insert(libraryEntry)
        .values({ userId: other, titleId: show })
        .returning({ id: libraryEntry.id });
      await tx.insert(watch).values({
        userId: other,
        libraryEntryId: theirs.id,
        titleId: show,
        episodeId: episodes[0],
        watchedAt: new Date(),
        source: "app",
        sourceKey: `test-${nextNumber()}`,
      });

      const detail = await getListDetail(reader, target.id, tx);

      // The progress join hangs off the user-scoped library-entry join, so somebody
      // else's copy of the title cannot leak a fraction onto this reader's list.
      expect(detail.titles[0].progress).toBeNull();
    });
  });
});

/**
 * *Removing a show leaves its list entries standing* — issue #151, read at the boundary the
 * list page itself uses. `tests/remove-from-library.test.ts` holds the row-survival half of
 * this against `list_membership` directly; what belongs here is `getListDetail`'s own view
 * of the same sequence, since that view — not the raw table — is what a row on screen reads
 * as untracked or owned from.
 */
describe("a title removed from the library, read through the list", () => {
  it("keeps its position, reads as untracked, then owned again once re-added", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const removed = await seedShow(tx);
      const staying = await seedShow(tx);
      const { list: target } = unwrap(await createList(reader, "Comfort shows", tx));
      await addTitleToList(reader, target.id, removed, tx);
      await addTitleToList(reader, target.id, staying, tx);

      const [entry] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: removed })
        .returning({ id: libraryEntry.id });

      const owned = await getListDetail(reader, target.id, tx);
      expect(owned.titles).toMatchObject([
        { titleId: removed, libraryEntryId: entry.id, position: 1 },
        { titleId: staying, libraryEntryId: null, position: 2 },
      ]);

      await removeTitleFromLibrary(reader, entry.id, tx);

      const untracked = await getListDetail(reader, target.id, tx);
      expect(untracked.titles).toMatchObject([
        { titleId: removed, libraryEntryId: null, position: 1 },
        { titleId: staying, libraryEntryId: null, position: 2 },
      ]);

      // Add to library puts it back — a fresh entry, not the one that was deleted.
      const [again] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: removed })
        .returning({ id: libraryEntry.id });

      const readded = await getListDetail(reader, target.id, tx);
      expect(readded.titles).toMatchObject([
        { titleId: removed, libraryEntryId: again.id, position: 1 },
        { titleId: staying, libraryEntryId: null, position: 2 },
      ]);
      expect(again.id).not.toBe(entry.id);
    });
  });

  /** The other account's own copy of the same title is a separate join, keyed by its own
   *  `user_id` — a removal that names the reader's entry has nothing to say about it. */
  it("leaves another account's own copy of the title, and their list, untouched", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const other = await seedUser(tx, "other");
      const shared = await seedShow(tx);
      const { list: mine } = unwrap(await createList(reader, "Mine", tx));
      const { list: theirs } = unwrap(await createList(other, "Theirs", tx));
      await addTitleToList(reader, mine.id, shared, tx);
      await addTitleToList(other, theirs.id, shared, tx);

      const [readerEntry] = await tx
        .insert(libraryEntry)
        .values({ userId: reader, titleId: shared })
        .returning({ id: libraryEntry.id });
      const [otherEntry] = await tx
        .insert(libraryEntry)
        .values({ userId: other, titleId: shared })
        .returning({ id: libraryEntry.id });

      await removeTitleFromLibrary(reader, readerEntry.id, tx);

      expect((await getListDetail(reader, mine.id, tx)).titles).toMatchObject([
        { titleId: shared, libraryEntryId: null },
      ]);
      expect((await getListDetail(other, theirs.id, tx)).titles).toMatchObject([
        { titleId: shared, libraryEntryId: otherEntry.id },
      ]);
    });
  });
});

/** Narrows a `CreateListOutcome` to its success case, for tests that seed a list only to
 *  act on it afterwards and have already asserted `createList` itself elsewhere. */
function unwrap<T extends { ok: boolean }>(outcome: T): Extract<T, { ok: true }> {
  if (!outcome.ok) throw new Error("Expected createList to succeed.");
  return outcome as Extract<T, { ok: true }>;
}

describe("taking a title off a list — issue #357", () => {
  async function seedList(
    tx: Transaction,
    reader: UserId,
    count: number,
  ): Promise<{ listId: string; titleIds: string[] }> {
    const { list: target } = unwrap(await createList(reader, "Trimmed", tx));
    const titleIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const show = await seedShow(tx);
      await addTitleToList(reader, target.id, show, tx);
      titleIds.push(show);
    }
    return { listId: target.id, titleIds };
  }

  async function membersOf(tx: Transaction, listId: string) {
    return tx
      .select({ titleId: listMembership.titleId, position: listMembership.position })
      .from(listMembership)
      .where(eq(listMembership.listId, listId))
      .orderBy(asc(listMembership.position));
  }

  it("removes the title and closes the gap it leaves, keeping everyone else's order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedList(tx, reader, 4);

      const outcome = await removeTitleFromList(reader, listId, titleIds[1], tx);

      expect(outcome).toEqual({ removed: true });
      expect(await membersOf(tx, listId)).toEqual([
        { titleId: titleIds[0], position: 1 },
        { titleId: titleIds[2], position: 2 },
        { titleId: titleIds[3], position: 3 },
      ]);
    });
  });

  it("is not an error to take off a title that is already gone — a retry after it landed", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedList(tx, reader, 2);

      await removeTitleFromList(reader, listId, titleIds[0], tx);
      const again = await removeTitleFromList(reader, listId, titleIds[0], tx);

      expect(again).toEqual({ removed: false });
      expect(await membersOf(tx, listId)).toEqual([{ titleId: titleIds[1], position: 1 }]);
    });
  });

  it("never touches another account's list", async () => {
    await inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { listId, titleIds } = await seedList(tx, owner, 2);

      const outcome = await removeTitleFromList(stranger, listId, titleIds[0], tx);

      expect(outcome).toEqual({ removed: false });
      expect(await membersOf(tx, listId)).toHaveLength(2);
    });
  });

  it("leaves the title itself, and the library, alone", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { listId, titleIds } = await seedList(tx, reader, 1);

      await removeTitleFromList(reader, listId, titleIds[0], tx);

      const [still] = await tx.select({ id: title.id }).from(title).where(eq(title.id, titleIds[0]));
      expect(still?.id).toBe(titleIds[0]);
    });
  });
});

describe("renaming a list — issue #357", () => {
  it("renames it, trimming the new name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { list: target } = unwrap(await createList(reader, "Comfrot shows", tx));

      const outcome = await renameList(reader, target.id, "  Comfort shows  ", tx);

      expect(outcome).toEqual({ ok: true, name: "Comfort shows" });
      expect((await listLists(reader, tx)).map((one) => one.name)).toEqual(["Comfort shows"]);
    });
  });

  it("refuses a name another of the same account's lists already has, and writes nothing", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      unwrap(await createList(reader, "Anime", tx));
      const { list: target } = unwrap(await createList(reader, "MCU", tx));

      const outcome = await renameList(reader, target.id, "Anime", tx);

      expect(outcome).toEqual({ ok: false, reason: "duplicate" });
      expect((await listLists(reader, tx)).map((one) => one.name)).toEqual(["Anime", "MCU"]);
    });
  });

  it("is not a duplicate to rename a list to its own name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { list: target } = unwrap(await createList(reader, "MCU", tx));

      expect(await renameList(reader, target.id, "MCU", tx)).toEqual({ ok: true, name: "MCU" });
    });
  });

  it("refuses an empty name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx, "reader");
      const { list: target } = unwrap(await createList(reader, "MCU", tx));

      await expect(renameList(reader, target.id, "   ", tx)).rejects.toThrow();
    });
  });

  it("refuses to rename another account's list", async () => {
    await inTransaction(async (tx) => {
      const owner = await seedUser(tx, "owner");
      const stranger = await seedUser(tx, "stranger");
      const { list: target } = unwrap(await createList(owner, "Mine", tx));

      await expect(renameList(stranger, target.id, "Yours", tx)).rejects.toThrow();
      expect((await listLists(owner, tx)).map((one) => one.name)).toEqual(["Mine"]);
    });
  });
});
