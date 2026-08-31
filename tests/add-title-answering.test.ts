import { readFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { asUserId, titlesDueForRefresh, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, user } from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";
import {
  addTitleAnswering,
  type FetchMirror,
} from "@/app/(signed-in)/search/add-title";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The add that answers immediately, and the mirror that runs behind it (issue #271),
 * against real Postgres.
 *
 * ── What this file is, and is not ─────────────────────────────────────────────────────
 *
 * `addTitleAnswering` is the seam the split created: it writes the library entry against
 * the `title` row alone and hands back the season-and-episode mirror **unrun**, for the
 * action to give to `after()`. It takes the mirror fetcher as an argument in exactly the
 * shape `runNightlySweep` takes one, and for the identical reason — nothing here imports
 * `@/tmdb/catalogue`, which is `import "server-only"` and a hard throw under plain Node
 * module resolution, so a stub stands in for it and nothing touches the network
 * (`SPEC.md` §6). This file is `tests/nightly-sweep.test.ts`'s shape for that reason.
 *
 * The four properties are the ticket's: the entry is written and returned **before** the
 * mirror runs; `episodes_mirrored_at` is stamped only when the mirror completes; a mirror
 * that throws leaves the title pending, raises nothing and reports; and a film is stamped
 * on the way in, because a film has nothing to wait for.
 *
 * `setUpTestDatabase` and `inTransaction` from issue #40's harness, and nothing else.
 */

/**
 * Sentry, faked whole. The failure path's whole answer is *report and carry on* — no
 * throw, no toast, nothing returned that says the mirror landed — so the report is the
 * only thing left to assert, and asserting it needs a double. `captureException` is the
 * one call this module makes; a second would fail here by name rather than silently.
 */
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const { captureException } = await import("@sentry/nextjs");

setUpTestDatabase("mediasafe_add_answering_test");

let counter = 0;
const nextNumber = () => ++counter;

beforeEach(() => {
  vi.mocked(captureException).mockClear();
});

async function seedUser(tx: Transaction, name: string): Promise<UserId> {
  const id = `${name}-${nextNumber()}`;
  await tx.insert(user).values({ id, name, email: `${id}@example.test` });
  return asUserId(id);
}

/**
 * The `title` row alone — what `titleRowMirror` returns for a show, and what the add
 * writes on the way in: every borrowed column of the series, and no episodes, because
 * the seasons have not been fetched yet.
 */
function showRowMirror(): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "show",
    tmdbId,
    externalId: `tvdb:${tmdbId}`,
    name: `Show ${tmdbId}`,
    releaseYear: 2011,
    releaseDate: "2011-04-17",
    posterPath: "/poster.jpg",
    inProduction: false,
    runtimeMins: null,
    episodes: [],
  };
}

/** The same show once its seasons have arrived — what the background fetcher answers. */
function withEpisodes(row: TitleMirror): TitleMirror {
  return {
    ...row,
    episodes: [
      {
        tmdbEpisodeId: nextNumber() + 900_000,
        seasonNo: 1,
        episodeNo: 1,
        name: "Winter Is Coming",
        airDate: "2011-04-17",
        runtimeMins: 62,
        stillPath: "/winter-is-coming.jpg",
      },
      {
        tmdbEpisodeId: nextNumber() + 900_000,
        seasonNo: 1,
        episodeNo: 2,
        name: "The Kingsroad",
        airDate: "2011-04-24",
        runtimeMins: 56,
        stillPath: null,
      },
    ],
  };
}

function filmRowMirror(): TitleMirror {
  const tmdbId = nextNumber();
  return {
    kind: "film",
    tmdbId,
    externalId: null,
    name: `Film ${tmdbId}`,
    releaseYear: 1977,
    releaseDate: "1977-05-25",
    posterPath: "/film.jpg",
    inProduction: null,
    runtimeMins: 121,
    episodes: [],
  };
}

/** A fetcher that answers the full mirror, and records that it was reached. */
function fetcherFor(full: TitleMirror): { fetchMirror: FetchMirror; ran: () => boolean } {
  let ran = false;
  return {
    fetchMirror: async () => {
      ran = true;
      return full;
    },
    ran: () => ran,
  };
}

async function episodesMirroredAtOf(tx: Transaction, titleId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ episodesMirroredAt: title.episodesMirroredAt })
    .from(title)
    .where(eq(title.id, titleId));
  return row.episodesMirroredAt;
}

async function episodeCountOf(tx: Transaction, titleId: string): Promise<number> {
  return (await tx.select({ id: episode.id }).from(episode).where(eq(episode.titleId, titleId)))
    .length;
}

async function entryTitleIdsOf(tx: Transaction, userId: UserId): Promise<string[]> {
  return (
    await tx
      .select({ titleId: libraryEntry.titleId })
      .from(libraryEntry)
      .where(eq(libraryEntry.userId, userId))
  ).map((row) => row.titleId);
}

describe("addTitleAnswering", () => {
  it("writes the entry and answers before the season-and-episode mirror runs", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const row = showRowMirror();
      const { fetchMirror, ran } = fetcherFor(withEpisodes(row));

      const answered = await addTitleAnswering(userId, row, fetchMirror, tx);

      // The whole ticket, in two assertions: the reader's library holds the show, and
      // the seasons have not been asked for yet.
      expect(ran()).toBe(false);
      expect(answered.added).toBe(true);
      expect(await entryTitleIdsOf(tx, userId)).toEqual([answered.titleId]);

      // And it is pending — a fact the database holds, not one inferred from the empty
      // episode list beside it.
      expect(await episodesMirroredAtOf(tx, answered.titleId)).toBeNull();
      expect(await episodeCountOf(tx, answered.titleId)).toBe(0);
    }));

  it("stamps the title only once the mirror has landed", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const row = showRowMirror();
      const { fetchMirror, ran } = fetcherFor(withEpisodes(row));

      const answered = await addTitleAnswering(userId, row, fetchMirror, tx);
      expect(await episodesMirroredAtOf(tx, answered.titleId)).toBeNull();

      await answered.mirrorEpisodes();

      expect(ran()).toBe(true);
      expect(await episodeCountOf(tx, answered.titleId)).toBe(2);
      expect(await episodesMirroredAtOf(tx, answered.titleId)).not.toBeNull();
    }));

  it("leaves the title pending and reports when the mirror throws, and raises nothing", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const row = showRowMirror();
      const unreachable = new Error("TMDB is unreachable");
      const fetchMirror: FetchMirror = async () => {
        throw unreachable;
      };

      const answered = await addTitleAnswering(userId, row, fetchMirror, tx);

      // Raises nothing: the library entry landed, so no write was lost and the
      // write-failure toast does not apply. `await` rather than `rejects`, because the
      // property is that there is nothing to catch.
      await expect(answered.mirrorEpisodes()).resolves.toBeUndefined();

      // Not manufactured into a successful-looking empty result: the title is still
      // pending, and Sentry heard about it.
      expect(await episodesMirroredAtOf(tx, answered.titleId)).toBeNull();
      expect(await episodeCountOf(tx, answered.titleId)).toBe(0);
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureException).mock.calls[0][0]).toBe(unreachable);
    }));

  it("leaves a title the nightly sweep picks up ahead of everything else", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      // Mirrored years ago and stamped complete, so it is what the sweep would otherwise
      // reach first: a pending title is newer by `metadata_refreshed_at`, and must still
      // come before it.
      await tx.insert(title).values({
        kind: "show",
        tmdbId: nextNumber(),
        name: "Long unrefreshed",
        metadataRefreshedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      const failing: FetchMirror = async () => {
        throw new Error("TMDB answered 500");
      };

      const answered = await addTitleAnswering(userId, showRowMirror(), failing, tx);
      await answered.mirrorEpisodes();

      const due = await titlesDueForRefresh(10, tx);
      expect(due[0].id).toBe(answered.titleId);
    }));

  it("stamps a film on the way in, because a film has nothing to wait for", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const film = filmRowMirror();
      const { fetchMirror, ran } = fetcherFor(film);

      const answered = await addTitleAnswering(userId, film, fetchMirror, tx);

      expect(await episodesMirroredAtOf(tx, answered.titleId)).not.toBeNull();

      // And there is no second half at all: the film's mirror was whole on the way in,
      // so the task handed to `after()` asks TMDB for nothing.
      await answered.mirrorEpisodes();
      expect(ran()).toBe(false);
    }));

  it("does not make a title another account has already mirrored pending again", () =>
    inTransaction(async (tx) => {
      const first = await seedUser(tx, "adham");
      const second = await seedUser(tx, "sam");
      const row = showRowMirror();
      const { fetchMirror } = fetcherFor(withEpisodes(row));

      const mine = await addTitleAnswering(first, row, fetchMirror, tx);
      await mine.mirrorEpisodes();

      // The second add writes the same global row from the title-only mirror. It must
      // not take a complete title back to pending for everybody holding it.
      const yours = await addTitleAnswering(second, row, fetchMirror, tx);

      expect(yours.titleId).toBe(mine.titleId);
      expect(await episodesMirroredAtOf(tx, yours.titleId)).not.toBeNull();
      expect(await episodeCountOf(tx, yours.titleId)).toBe(2);
    }));

  it("still reports an add of a title that was already in this library as a success", () =>
    inTransaction(async (tx) => {
      const userId = await seedUser(tx, "adham");
      const row = showRowMirror();
      const { fetchMirror } = fetcherFor(withEpisodes(row));

      await addTitleAnswering(userId, row, fetchMirror, tx);
      const again = await addTitleAnswering(userId, row, fetchMirror, tx);

      expect(again.added).toBe(false);
      expect(await entryTitleIdsOf(tx, userId)).toEqual([again.titleId]);
    }));
});

/**
 * The half of the criterion that lives in a module Vitest cannot import: `actions.ts`
 * reaches `@/tmdb/catalogue`, which is `import "server-only"`, so the action itself can
 * only be read as text — the same wall `tests/nightly-sweep-route.test.ts` documents, and
 * the same answer `tests/cache-tags.test.ts` gives for its call-site audit.
 *
 * What it holds is that the mirror is **scheduled**, not awaited: `after` from
 * `next/server` is the framework's own after-response mechanism, and the ticket forbids a
 * queue table or any background infrastructure beside it. An `await` here would put the
 * seasons back in front of the response and nothing else in the suite would notice.
 */
describe("the add path schedules the mirror after the response", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "..", "app/(signed-in)/search/actions.ts"),
    "utf8",
  );

  it("hands the mirror to next/server's after rather than awaiting it", () => {
    expect(source).toContain('import { after } from "next/server"');
    expect(source).toContain("after(mirrorEpisodes)");
  });
});
