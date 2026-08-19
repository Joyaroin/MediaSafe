import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addTitleToList,
  asUserId,
  createList,
  createListAndAddTitle,
  deleteList,
  getListDetail,
  listLists,
  ownedBy,
  removeTitleFromLibrary,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { libraryEntry, list, listMembership, title, user, watch } from "@/db/schema";
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
async function seedShow(tx: Transaction): Promise<string> {
  const number = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId: number,
      name: `Show ${number}`,
      releaseYear: 2022,
      inProduction: true,
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
