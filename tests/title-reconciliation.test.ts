import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runNightlySweep, type FetchMirror } from "@/app/api/cron/nightly-sweep/run-sweep";
import type { FindByExternalId } from "@/app/api/cron/nightly-sweep/reconcile-title";
import { asUserId, watchedTmdbEpisodeIds, type UserId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, libraryEntry, title, titleReconciliation, user, watch } from "@/db/schema";
import { TmdbHttpError, type EpisodeMirror, type ExternalId, type TitleMirror } from "@/tmdb/mirror";
import type { TmdbFindPayload } from "@/tmdb/reconcile";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Reconciling a title whose TMDB id is gone (issue #116), against real
 * Postgres.
 *
 * ── What this file is, and is not ────────────────────────────────────────────────────
 *
 * **The decision is not tested here.** It is a pure function and every branch of it is
 * pinned against captured `/find` responses in `tests/tmdb-reconcile.test.ts`, with no
 * database in reach. What is left is everything the decision cannot express on its own:
 * that a repoint moves `title.tmdb_id` and *nothing else that matters*, that a quarantine
 * writes literally nothing — including `metadata_refreshed_at` — and that one of either
 * never stops the run.
 *
 * The two assertions worth naming, because they are the ones the ticket exists for:
 *
 *  - **`watch` is read before and after every write below and compared row for row.** Not
 *    counted — compared, by `id` and `episode_id`, because a watch silently repointed at a
 *    different episode is exactly as many rows as one that was not.
 *  - **A quarantine's `metadata_refreshed_at` is asserted unchanged to the millisecond**,
 *    and the title is asserted to still be in the queue on the next run. "Skipped" and
 *    "skipped and stamped as refreshed" look identical for one night and differ forever
 *    after.
 *
 * Nothing here touches TMDB: `FetchMirror` and `FindByExternalId` are both stubs, exactly
 * as `tests/nightly-sweep.test.ts` stubs the first of them.
 */

setUpTestDatabase("mediasafe_title_reconciliation_test");

let counter = 0;
const nextNumber = () => ++counter;

const EVIDENCE: ExternalId = "tvdb:81189";

/** `n` days before now — for `metadata_refreshed_at` fixtures. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** What TMDB answers for an id it has deleted or merged: 404, and nothing else. */
const gone = (tmdbId: number) =>
  new TmdbHttpError(404, `TMDB answered 404 for /tv/${tmdbId}`);

interface SeededTitle {
  readonly id: string;
  readonly tmdbId: number;
}

async function seedShow(
  tx: Transaction,
  seed: { externalId?: ExternalId | null; metadataRefreshedAt?: Date } = {},
): Promise<SeededTitle> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "show",
      tmdbId,
      name: `Title ${tmdbId}`,
      externalId: seed.externalId === undefined ? EVIDENCE : seed.externalId,
      inProduction: false,
      metadataRefreshedAt: seed.metadataRefreshedAt ?? daysAgo(30),
    })
    .returning({ id: title.id, tmdbId: title.tmdbId });
  return row;
}

async function seedEpisode(
  tx: Transaction,
  titleId: string,
  tmdbEpisodeId: number,
  episodeNo: number,
): Promise<string> {
  const [row] = await tx
    .insert(episode)
    .values({ titleId, tmdbEpisodeId, seasonNo: 1, episodeNo, name: `Episode ${episodeNo}` })
    .returning({ id: episode.id });
  return row.id;
}

/** A signed-up account with this title in its library — what makes a watch insertable. */
async function seedViewer(tx: Transaction, titleId: string): Promise<[UserId, string]> {
  const id = `user-${nextNumber()}`;
  await tx.insert(user).values({ id, name: "A viewer", email: `${id}@example.test` });
  const [entry] = await tx
    .insert(libraryEntry)
    .values({ userId: id, titleId })
    .returning({ id: libraryEntry.id });
  return [asUserId(id), entry.id];
}

async function seedWatch(
  tx: Transaction,
  where: { userId: UserId; libraryEntryId: string; titleId: string; episodeId: string },
): Promise<void> {
  await tx.insert(watch).values({
    userId: where.userId,
    libraryEntryId: where.libraryEntryId,
    titleId: where.titleId,
    episodeId: where.episodeId,
    watchedAt: daysAgo(2),
    source: "app",
    sourceKey: `key-${nextNumber()}`,
  });
}

/** Every watch in the database, by id, with the episode it points at. */
async function allWatches(tx: Transaction): Promise<{ id: string; episodeId: string | null }[]> {
  const rows = await tx
    .select({ id: watch.id, episodeId: watch.episodeId })
    .from(watch)
    .orderBy(watch.id);
  return rows;
}

async function titleRow(tx: Transaction, titleId: string) {
  const [row] = await tx
    .select({
      tmdbId: title.tmdbId,
      name: title.name,
      metadataRefreshedAt: title.metadataRefreshedAt,
    })
    .from(title)
    .where(eq(title.id, titleId));
  return row;
}

async function reconciliationsOf(tx: Transaction, titleId: string) {
  return tx
    .select({
      fromTmdbId: titleReconciliation.fromTmdbId,
      toTmdbId: titleReconciliation.toTmdbId,
      evidenceExternalId: titleReconciliation.evidenceExternalId,
      reconciledAt: titleReconciliation.reconciledAt,
    })
    .from(titleReconciliation)
    .where(eq(titleReconciliation.titleId, titleId));
}

function episodeMirror(tmdbEpisodeId: number, episodeNo: number): EpisodeMirror {
  return {
    tmdbEpisodeId,
    seasonNo: 1,
    episodeNo,
    name: `Episode ${episodeNo}`,
    airDate: "2008-01-20",
    runtimeMins: 45,
    stillPath: `/episode-${episodeNo}.jpg`,
  };
}

function survivorMirror(tmdbId: number, episodes: readonly EpisodeMirror[]): TitleMirror {
  return {
    kind: "show",
    tmdbId,
    externalId: EVIDENCE,
    name: `Survivor ${tmdbId}`,
    releaseYear: 2008,
    releaseDate: "2008-01-20",
    posterPath: null,
    inProduction: false,
    runtimeMins: null,
    episodes,
  };
}

/**
 * A show with one episode, one viewer, and one watch on that episode.
 *
 * Every quarantine below is seeded through this rather than with a bare title, so that
 * *"no watch is ever repointed, under any branch"* is asserted **on every branch** rather
 * than only on the branch that is about watches. A quarantine with no watches in the
 * database cannot tell a watch left alone from a watch there never was.
 */
async function seedWatchedShow(
  tx: Transaction,
  seed: { externalId?: ExternalId | null; metadataRefreshedAt?: Date } = {},
): Promise<SeededTitle & { readonly watchedTmdbEpisodeId: number }> {
  const show = await seedShow(tx, seed);
  const watchedTmdbEpisodeId = 530_000 + nextNumber();
  const episodeId = await seedEpisode(tx, show.id, watchedTmdbEpisodeId, 1);
  const [userId, libraryEntryId] = await seedViewer(tx, show.id);
  await seedWatch(tx, { userId, libraryEntryId, titleId: show.id, episodeId });
  return { ...show, watchedTmdbEpisodeId };
}

/** `/find` answering with exactly one surviving show. */
const findsOne = (tmdbId: number): FindByExternalId => async () =>
  ({ tv_results: [{ id: tmdbId }] }) satisfies TmdbFindPayload;

/** `/find` answering with five empty lists — the id is gone from TMDB's catalogue too. */
const findsNothing: FindByExternalId = async () => ({});

/**
 * `goneId` 404s; every other id answers with `survivor`. The shape of every sweep below:
 * the title the sweep picked has vanished, and the id `/find` names still resolves.
 */
function fetchExcept(goneId: number, survivor: TitleMirror): FetchMirror {
  return async (_kind, tmdbId) => {
    if (tmdbId === goneId) throw gone(tmdbId);
    return { ...survivor, tmdbId };
  };
}

describe("watchedTmdbEpisodeIds", () => {
  it("answers with every episode somebody has watched, once each", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      const watched = await seedEpisode(tx, show.id, 500_001, 1);
      await seedEpisode(tx, show.id, 500_002, 2);
      const [userId, libraryEntryId] = await seedViewer(tx, show.id);
      // Twice — a rewatch. One episode, not two.
      await seedWatch(tx, { userId, libraryEntryId, titleId: show.id, episodeId: watched });
      await seedWatch(tx, { userId, libraryEntryId, titleId: show.id, episodeId: watched });

      expect(await watchedTmdbEpisodeIds(show.id, tx)).toEqual([500_001]);
    }));

  it("counts a stranger's watch, because title and episode are global", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      const watched = await seedEpisode(tx, show.id, 500_003, 1);
      const [stranger, strangerEntry] = await seedViewer(tx, show.id);
      await seedWatch(tx, {
        userId: stranger,
        libraryEntryId: strangerEntry,
        titleId: show.id,
        episodeId: watched,
      });

      // No user id is passed, and there is nowhere to pass one. An episode a stranger has
      // watched is an episode this title may not lose.
      expect(await watchedTmdbEpisodeIds(show.id, tx)).toEqual([500_003]);
    }));

  it("answers with nothing for a title nobody has watched", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      await seedEpisode(tx, show.id, 500_004, 1);

      expect(await watchedTmdbEpisodeIds(show.id, tx)).toEqual([]);
    }));
});

describe("a 404 that reconciles", () => {
  it("repoints the title, keeps every watch, and records what happened", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      const episodeId = await seedEpisode(tx, show.id, 510_001, 1);
      const [userId, libraryEntryId] = await seedViewer(tx, show.id);
      await seedWatch(tx, { userId, libraryEntryId, titleId: show.id, episodeId });
      const watchesBefore = await allWatches(tx);

      const survivingId = show.tmdbId + 100_000;
      const survivor = survivorMirror(survivingId, [episodeMirror(510_001, 1)]);

      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivor),
        findsOne(survivingId),
        10,
        tx,
      );

      expect(outcome.repointed.map((one) => one.toTmdbId)).toEqual([survivingId]);
      expect(outcome.quarantined).toEqual([]);
      expect(outcome.failures).toEqual([]);

      const after = await titleRow(tx, show.id);
      expect(after.tmdbId).toBe(survivingId);
      // The whole mirror was written, not just the id — this is a refresh that happens to
      // change the id it refreshed from.
      expect(after.name).toBe(`Survivor ${survivingId}`);

      // Row for row, by id and by the episode each points at. A watch quietly moved to a
      // different episode is exactly as many rows as a watch left alone.
      expect(await allWatches(tx)).toEqual(watchesBefore);

      const [record] = await reconciliationsOf(tx, show.id);
      expect(record).toMatchObject({
        fromTmdbId: show.tmdbId,
        toTmdbId: survivingId,
        evidenceExternalId: EVIDENCE,
      });
      expect(record.reconciledAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }));

  it("keeps the same episode rows, so nothing a watch points at is rewritten", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      const episodeId = await seedEpisode(tx, show.id, 510_002, 1);
      const [userId, libraryEntryId] = await seedViewer(tx, show.id);
      await seedWatch(tx, { userId, libraryEntryId, titleId: show.id, episodeId });

      const survivingId = show.tmdbId + 100_000;
      // The survivor renumbers the episode and renames it — both borrowed attributes —
      // and adds one. The TMDB episode id is what makes it the same episode.
      const survivor = survivorMirror(survivingId, [
        { ...episodeMirror(510_002, 4), name: "Renamed" },
        episodeMirror(510_003, 5),
      ]);

      await runNightlySweep(fetchExcept(show.tmdbId, survivor), findsOne(survivingId), 10, tx);

      const [row] = await tx
        .select({ id: episode.id, episodeNo: episode.episodeNo, name: episode.name })
        .from(episode)
        .where(eq(episode.tmdbEpisodeId, 510_002));
      expect(row.id).toBe(episodeId);
      expect(row.episodeNo).toBe(4);
      expect(row.name).toBe("Renamed");
    }));

  it("reconciles a title nobody has watched at all", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx);
      await seedEpisode(tx, show.id, 510_004, 1);

      const survivingId = show.tmdbId + 100_000;
      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(survivingId, [])),
        findsOne(survivingId),
        10,
        tx,
      );

      expect(outcome.repointed).toHaveLength(1);
      expect((await titleRow(tx, show.id)).tmdbId).toBe(survivingId);
    }));
});

describe("a 404 that is quarantined", () => {
  /**
   * Snapshot everything a quarantine must not change, and return the check that proves it
   * did not: the title's id, its name, its `metadata_refreshed_at`, that no reconciliation
   * was recorded, and every watch row for row.
   *
   * **A closure rather than a pair of arguments**, and that is the whole reason it is
   * shaped this way. The obvious spelling takes a "before" and compares it to an "after",
   * and a caller can hand it a snapshot read *after* the sweep — which still passes,
   * because it is then comparing the result to itself. Reading the baseline is the act of
   * asking for the check, so there is no order left to get wrong.
   */
  async function untouchedAfter(
    tx: Transaction,
    show: SeededTitle,
  ): Promise<() => Promise<void>> {
    const before = await titleRow(tx, show.id);
    const watchesBefore = await allWatches(tx);

    return async () => {
      const after = await titleRow(tx, show.id);
      expect(after.tmdbId).toBe(show.tmdbId);
      expect(after.name).toBe(before.name);
      expect(after.metadataRefreshedAt.getTime()).toBe(before.metadataRefreshedAt.getTime());
      expect(await reconciliationsOf(tx, show.id)).toEqual([]);
      expect(await allWatches(tx)).toEqual(watchesBefore);
    };
  }

  it("quarantines a title with no external id, and never looks anything up", () =>
    inTransaction(async (tx) => {
      const show = await seedWatchedShow(tx, { externalId: null });
      const stillUntouched = await untouchedAfter(tx, show);

      const neverSearched: FindByExternalId = () => {
        throw new Error("no external id: nothing may be looked up, and nothing searched");
      };
      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(show.tmdbId + 100_000, [])),
        neverSearched,
        10,
        tx,
      );

      expect(outcome.quarantined.map((one) => one.reason)).toEqual(["no-external-id"]);
      await stillUntouched();
    }));

  it("quarantines when the external id resolves to nothing", () =>
    inTransaction(async (tx) => {
      const show = await seedWatchedShow(tx);
      const stillUntouched = await untouchedAfter(tx, show);

      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(show.tmdbId + 100_000, [])),
        findsNothing,
        10,
        tx,
      );

      expect(outcome.quarantined.map((one) => one.reason)).toEqual(["no-surviving-id"]);
      await stillUntouched();
    }));

  it("quarantines when the external id resolves to more than one, rather than picking", () =>
    inTransaction(async (tx) => {
      const show = await seedWatchedShow(tx);
      const stillUntouched = await untouchedAfter(tx, show);
      const [first, second] = [show.tmdbId + 100_000, show.tmdbId + 200_000];

      const findsTwo: FindByExternalId = async () => ({
        tv_results: [{ id: first }, { id: second }],
      });
      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(first, [])),
        findsTwo,
        10,
        tx,
      );

      expect(outcome.quarantined.map((one) => one.reason)).toEqual([
        "more-than-one-surviving-id",
      ]);
      await stillUntouched();
    }));

  it("quarantines when an episode carrying watches is missing from the survivor", () =>
    inTransaction(async (tx) => {
      // Seeded by hand rather than through `seedWatchedShow`, because this case needs
      // to name the watched episode's TMDB id: the survivor's own S1 E1 must carry a
      // different one for the assertion below to mean anything.
      const show = await seedShow(tx);
      const watchedEpisode = await seedEpisode(tx, show.id, 520_001, 1);
      const [userId, libraryEntryId] = await seedViewer(tx, show.id);
      await seedWatch(tx, {
        userId,
        libraryEntryId,
        titleId: show.id,
        episodeId: watchedEpisode,
      });
      const stillUntouched = await untouchedAfter(tx, show);

      const survivingId = show.tmdbId + 100_000;
      // The survivor has an S1 E1 of its own, under a different TMDB episode id. Same
      // numbers, same name — and not the episode this watch is about.
      const survivor = survivorMirror(survivingId, [episodeMirror(999_001, 1)]);

      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivor),
        findsOne(survivingId),
        10,
        tx,
      );

      expect(outcome.quarantined.map((one) => one.reason)).toEqual([
        "watched-episode-missing",
      ]);
      await stillUntouched();
      // Not repointed, and not created either: the survivor's episode was never written.
      const written = await tx
        .select({ id: episode.id })
        .from(episode)
        .where(eq(episode.tmdbEpisodeId, 999_001));
      expect(written).toEqual([]);
    }));

  it("quarantines rather than merging when the surviving id is already a title of its own", () =>
    inTransaction(async (tx) => {
      const show = await seedWatchedShow(tx);
      // Somebody already added the entry TMDB merged this one into. Repointing would
      // collide with `UNIQUE (kind, tmdb_id)`, and merging the two rows would mean moving
      // watches between titles — which never happens.
      const survivorRow = await seedShow(tx, { metadataRefreshedAt: new Date() });
      const stillUntouched = await untouchedAfter(tx, show);

      // The survivor still carries the watched episode, so the episode check passes and
      // this reaches the write — which is the only place the collision can be found. A
      // survivor without it would quarantine one step earlier, as `watched-episode-
      // missing`, and this test would pass while proving nothing about the collision.
      const survivor = survivorMirror(survivorRow.tmdbId, [
        episodeMirror(show.watchedTmdbEpisodeId, 1),
      ]);
      const outcome = await runNightlySweep(
        fetchExcept(show.tmdbId, survivor),
        findsOne(survivorRow.tmdbId),
        // A cap of 1 so the sweep picks only the vanished title: it is the older of the
        // two by `metadata_refreshed_at`, and `titlesDueForRefresh` reads oldest first.
        1,
        tx,
      );

      expect(outcome.quarantined.map((one) => one.reason)).toEqual([
        "surviving-id-already-mirrored",
      ]);
      await stillUntouched();
      // And the title that was already there is untouched too.
      expect((await titleRow(tx, survivorRow.id)).tmdbId).toBe(survivorRow.tmdbId);
    }));

  it("leaves a quarantined title in the queue for the next run", () =>
    inTransaction(async (tx) => {
      const refreshedAt = daysAgo(40);
      const show = await seedShow(tx, { metadataRefreshedAt: refreshedAt });

      await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(show.tmdbId + 100_000, [])),
        findsNothing,
        10,
        tx,
      );

      const after = await titleRow(tx, show.id);
      expect(after.metadataRefreshedAt.getTime()).toBe(refreshedAt.getTime());

      // Not merely unstamped — actually picked again, which is the thing that matters.
      const secondRun = await runNightlySweep(
        fetchExcept(show.tmdbId, survivorMirror(show.tmdbId + 100_000, [])),
        findsNothing,
        10,
        tx,
      );
      expect(secondRun.quarantined.map((one) => one.candidate.id)).toEqual([show.id]);
    }));
});

describe("one gone title never stops the run", () => {
  it("refreshes the other titles around a quarantine", () =>
    inTransaction(async (tx) => {
      const vanished = await seedShow(tx, { metadataRefreshedAt: daysAgo(40) });
      const ordinary = await seedShow(tx, { metadataRefreshedAt: daysAgo(30) });

      const outcome = await runNightlySweep(
        fetchExcept(vanished.tmdbId, survivorMirror(0, [])),
        findsNothing,
        10,
        tx,
      );

      expect(outcome.candidates).toBe(2);
      expect(outcome.refreshed.map(({ id }) => id)).toEqual([ordinary.id]);
      expect(outcome.quarantined).toHaveLength(1);
      expect(outcome.failures).toEqual([]);
      expect((await titleRow(tx, ordinary.id)).metadataRefreshedAt.getTime()).toBeGreaterThan(
        Date.now() - 60_000,
      );
    }));

  it("treats a lookup that could not be made as a failure, not a quarantine", () =>
    inTransaction(async (tx) => {
      const refreshedAt = daysAgo(40);
      const vanished = await seedShow(tx, { metadataRefreshedAt: refreshedAt });
      const ordinary = await seedShow(tx, { metadataRefreshedAt: daysAgo(30) });

      const unreachable: FindByExternalId = async () => {
        throw new TmdbHttpError(503, "TMDB answered 503 for /find/81189");
      };
      const outcome = await runNightlySweep(
        fetchExcept(vanished.tmdbId, survivorMirror(0, [])),
        unreachable,
        10,
        tx,
      );

      // *MediaSafe could not do this*, which is a different thing from *MediaSafe looked
      // and declined to guess* — and it still must not stop the run or stamp the title.
      expect(outcome.failures.map((one) => one.candidate.id)).toEqual([vanished.id]);
      expect(outcome.quarantined).toEqual([]);
      expect(outcome.refreshed.map(({ id }) => id)).toEqual([ordinary.id]);
      expect((await titleRow(tx, vanished.id)).metadataRefreshedAt.getTime()).toBe(
        refreshedAt.getTime(),
      );
      expect((await titleRow(tx, ordinary.id)).metadataRefreshedAt.getTime()).toBeGreaterThan(
        Date.now() - 60_000,
      );
    }));

  it("does not reconcile a survivor that 404s in turn", () =>
    inTransaction(async (tx) => {
      const show = await seedShow(tx, { metadataRefreshedAt: daysAgo(40) });
      const survivingId = show.tmdbId + 100_000;

      // Both ids are gone. The second 404 is an ordinary failure — there is no second
      // reconciliation to recurse into, and no third id to look up.
      const everythingGone: FetchMirror = async (_kind, tmdbId) => {
        throw gone(tmdbId);
      };
      const outcome = await runNightlySweep(
        everythingGone,
        findsOne(survivingId),
        10,
        tx,
      );

      expect(outcome.failures.map((one) => one.candidate.id)).toEqual([show.id]);
      expect(outcome.quarantined).toEqual([]);
      expect(outcome.repointed).toEqual([]);
      expect(await reconciliationsOf(tx, show.id)).toEqual([]);
    }));
});
