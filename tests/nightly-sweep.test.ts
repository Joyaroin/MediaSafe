import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  NIGHTLY_SWEEP_CAP,
  refreshTitleMirror,
  titlesDueForRefresh,
  type SweepCandidate,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import { episode, title } from "@/db/schema";
import type { TitleKind, TitleMirror } from "@/tmdb/mirror";
import { runNightlySweep, type FetchMirror } from "@/app/api/cron/nightly-sweep/run-sweep";
import type { FindByExternalId } from "@/app/api/cron/nightly-sweep/reconcile-title";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * The nightly sweep (ADR-0001, issue #115), against real Postgres.
 *
 * ── What this file is, and is not ─────────────────────────────────────────────────────
 *
 * `titlesDueForRefresh` and `refreshTitleMirror` are `db/access.ts`'s own functions and
 * are exercised directly, exactly as every other write in that module is tested. The
 * orchestration around them — one title at a time, a failure never stopping the run, no
 * stamp on a skip — is `run-sweep.ts`'s `runNightlySweep`, exercised here with a stub
 * `FetchMirror` so nothing here touches TMDB or the network (`SPEC.md` §6).
 *
 * `setUpTestDatabase` and `inTransaction` from issue #40's harness, and nothing else.
 */

setUpTestDatabase("mediasafe_nightly_sweep_test");

let counter = 0;
const nextNumber = () => ++counter;

/** `n` days before now, as a real `Date` — for `metadata_refreshed_at` fixtures. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * `n` days from today as `YYYY-MM-DD` — for `air_date` fixtures. Postgres compares
 * `air_date <= current_date` against the server's date, so these sit whole days either
 * side of it rather than a `Date`'s time-of-day, for the same reason
 * `tests/schema-and-derived-state.test.ts` does.
 */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface TitleSeed {
  kind?: TitleKind;
  inProduction?: boolean | null;
  metadataRefreshedAt?: Date;
}

async function seedTitle(tx: Transaction, seed: TitleSeed = {}): Promise<SweepCandidate> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: seed.kind ?? "show",
      tmdbId,
      name: `Title ${tmdbId}`,
      inProduction: seed.inProduction ?? null,
      metadataRefreshedAt: seed.metadataRefreshedAt ?? new Date(),
    })
    .returning({ id: title.id, kind: title.kind, tmdbId: title.tmdbId });
  // `external_id` is `null` on every title seeded here: nothing in this file reaches the
  // 404 path, which is the only thing that reads it. `tests/title-reconciliation.test.ts`
  // (#116) is where it is seeded and where that path is exercised.
  return { id: row.id, kind: row.kind as TitleKind, tmdbId: row.tmdbId, externalId: null };
}

async function seedEpisode(tx: Transaction, titleId: string, airDate: string): Promise<void> {
  await tx.insert(episode).values({
    titleId,
    tmdbEpisodeId: nextNumber() + 900_000,
    seasonNo: 1,
    episodeNo: nextNumber(),
    airDate,
  });
}

async function releaseDateOf(tx: Transaction, titleId: string): Promise<string | null> {
  const [row] = await tx
    .select({ releaseDate: title.releaseDate })
    .from(title)
    .where(eq(title.id, titleId));
  return row.releaseDate;
}

async function stillPathOf(tx: Transaction, titleId: string): Promise<string | null> {
  const [row] = await tx
    .select({ stillPath: episode.stillPath })
    .from(episode)
    .where(eq(episode.titleId, titleId));
  return row.stillPath;
}

async function metadataRefreshedAtOf(tx: Transaction, titleId: string): Promise<Date> {
  const [row] = await tx
    .select({ metadataRefreshedAt: title.metadataRefreshedAt })
    .from(title)
    .where(eq(title.id, titleId));
  return row.metadataRefreshedAt;
}

/** A refreshed mirror for a title that already exists — what a TMDB fetch returns. */
function mirrorFor(
  kind: TitleKind,
  tmdbId: number,
  overrides: Partial<TitleMirror> = {},
): TitleMirror {
  return {
    kind,
    tmdbId,
    externalId: null,
    name: `Refreshed ${tmdbId}`,
    releaseYear: 2020,
    releaseDate: "2020-01-01",
    posterPath: null,
    inProduction: kind === "show" ? false : null,
    runtimeMins: kind === "film" ? 100 : null,
    episodes: [],
    ...overrides,
  };
}

describe("titlesDueForRefresh", () => {
  it("puts an in-production show whose next air date has passed ahead of everything else", () =>
    inTransaction(async (tx) => {
      // Oldest of all by metadata_refreshed_at, and otherwise unremarkable.
      const oldest = await seedTitle(tx, { metadataRefreshedAt: daysAgo(10) });
      // Refreshed more recently than `oldest`, but in production, with an episode that
      // aired after its own last refresh and on or before today — the tier 1 predicate.
      const due = await seedTitle(tx, {
        inProduction: true,
        metadataRefreshedAt: daysAgo(2),
      });
      await seedEpisode(tx, due.id, daysFromToday(-1));
      // Newer still, and quiet: neither the oldest nor due for anything.
      const quiet = await seedTitle(tx, { metadataRefreshedAt: daysAgo(1) });

      const result = await titlesDueForRefresh(10, tx);

      expect(result.map((row) => row.id)).toEqual([due.id, oldest.id, quiet.id]);
    }));

  it("orders the remainder by oldest metadata_refreshed_at, oldest first", () =>
    inTransaction(async (tx) => {
      const newest = await seedTitle(tx, { metadataRefreshedAt: daysAgo(1) });
      const middle = await seedTitle(tx, { metadataRefreshedAt: daysAgo(5) });
      const oldest = await seedTitle(tx, { metadataRefreshedAt: daysAgo(10) });

      const result = await titlesDueForRefresh(10, tx);

      expect(result.map((row) => row.id)).toEqual([oldest.id, middle.id, newest.id]);
    }));

  it("does not treat an ended show's newly-aired episode as due", () =>
    inTransaction(async (tx) => {
      // Same shape as the tier 1 fixture above, except `in_production` is false: the show
      // has ended, so a late-arriving episode does not put it ahead of older titles.
      const ended = await seedTitle(tx, {
        inProduction: false,
        metadataRefreshedAt: daysAgo(2),
      });
      await seedEpisode(tx, ended.id, daysFromToday(-1));
      const older = await seedTitle(tx, { metadataRefreshedAt: daysAgo(5) });

      const result = await titlesDueForRefresh(10, tx);

      expect(result.map((row) => row.id)).toEqual([older.id, ended.id]);
    }));

  it("does not treat an unaired future episode as due", () =>
    inTransaction(async (tx) => {
      const show = await seedTitle(tx, {
        inProduction: true,
        metadataRefreshedAt: daysAgo(2),
      });
      // In the future: not aired yet, so nothing has "passed" since the last refresh.
      await seedEpisode(tx, show.id, daysFromToday(30));
      const older = await seedTitle(tx, { metadataRefreshedAt: daysAgo(5) });

      const result = await titlesDueForRefresh(10, tx);

      expect(result.map((row) => row.id)).toEqual([older.id, show.id]);
    }));

  it("does not treat an episode already known at the last refresh as due", () =>
    inTransaction(async (tx) => {
      const show = await seedTitle(tx, {
        inProduction: true,
        metadataRefreshedAt: daysAgo(2),
      });
      // Aired well before the last refresh — already reflected in the mirror, not a new
      // arrival since then.
      await seedEpisode(tx, show.id, daysFromToday(-30));
      const older = await seedTitle(tx, { metadataRefreshedAt: daysAgo(5) });

      const result = await titlesDueForRefresh(10, tx);

      expect(result.map((row) => row.id)).toEqual([older.id, show.id]);
    }));

  it("never returns more than the cap", () =>
    inTransaction(async (tx) => {
      for (let i = 1; i <= 5; i++) {
        await seedTitle(tx, { metadataRefreshedAt: daysAgo(i) });
      }

      expect(await titlesDueForRefresh(3, tx)).toHaveLength(3);
    }));

  it("defaults to NIGHTLY_SWEEP_CAP when no cap is given", () =>
    inTransaction(async (tx) => {
      await seedTitle(tx);
      const result = await titlesDueForRefresh(undefined, tx);
      expect(result.length).toBeLessThanOrEqual(NIGHTLY_SWEEP_CAP);
    }));

  it("fills the cap from tier 1 alone rather than spilling into tier 2", () =>
    inTransaction(async (tx) => {
      const earlierDue = await seedTitle(tx, {
        inProduction: true,
        metadataRefreshedAt: daysAgo(3),
      });
      await seedEpisode(tx, earlierDue.id, daysFromToday(-1));
      const laterDue = await seedTitle(tx, {
        inProduction: true,
        metadataRefreshedAt: daysAgo(2),
      });
      await seedEpisode(tx, laterDue.id, daysFromToday(-1));
      // Far older than either tier 1 title, and would sort first if tier 2 were ever
      // consulted — it must not be, because the cap of 1 is already spent by tier 1.
      await seedTitle(tx, { metadataRefreshedAt: daysAgo(100) });

      const result = await titlesDueForRefresh(1, tx);

      expect(result.map((row) => row.id)).toEqual([earlierDue.id]);
    }));

  it("turns the library over across consecutive runs rather than re-picking the same titles", () =>
    inTransaction(async (tx) => {
      const titles = [
        await seedTitle(tx, { metadataRefreshedAt: daysAgo(4) }),
        await seedTitle(tx, { metadataRefreshedAt: daysAgo(3) }),
        await seedTitle(tx, { metadataRefreshedAt: daysAgo(2) }),
        await seedTitle(tx, { metadataRefreshedAt: daysAgo(1) }),
      ];

      const firstPass = await titlesDueForRefresh(2, tx);
      expect(firstPass.map((row) => row.id)).toEqual([titles[0].id, titles[1].id]);

      for (const candidate of firstPass) {
        await refreshTitleMirror(mirrorFor(candidate.kind, candidate.tmdbId), tx);
      }

      // Refreshed titles now carry `now()`, so the second pass moves on to the two that
      // were not touched rather than reporting the first pass's titles again.
      const secondPass = await titlesDueForRefresh(2, tx);
      expect(secondPass.map((row) => row.id)).toEqual([titles[2].id, titles[3].id]);
    }));
});

describe("refreshTitleMirror", () => {
  it("moves metadata_refreshed_at to now as part of the same write", () =>
    inTransaction(async (tx) => {
      const candidate = await seedTitle(tx, { metadataRefreshedAt: daysAgo(30) });
      const before = await metadataRefreshedAtOf(tx, candidate.id);

      await refreshTitleMirror(mirrorFor(candidate.kind, candidate.tmdbId), tx);

      const after = await metadataRefreshedAtOf(tx, candidate.id);
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    }));

  it("fills in the release date and the episode still on a title that had neither", () =>
    inTransaction(async (tx) => {
      /**
       * The backfill, and the reason ADR-0001 amendment 10 ships no backfill migration.
       * `seedTitle` writes the pre-amendment row exactly — `release_date` NULL, no
       * episodes — and the sweep is what fills both columns as it reaches each title,
       * which is amendment 5's mechanism reused for amendment 5's reason: a one-off
       * script would be a second writer of rows every account reads.
       */
      const candidate = await seedTitle(tx, { kind: "show" });
      expect(await releaseDateOf(tx, candidate.id)).toBeNull();

      await refreshTitleMirror(
        mirrorFor(candidate.kind, candidate.tmdbId, {
          releaseDate: "2011-04-17",
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
          ],
        }),
        tx,
      );

      expect(await releaseDateOf(tx, candidate.id)).toBe("2011-04-17");
      expect(await stillPathOf(tx, candidate.id)).toBe("/winter-is-coming.jpg");
    }));

  it("clears a still TMDB has withdrawn rather than keeping a path it no longer serves", () =>
    inTransaction(async (tx) => {
      /**
       * The other direction, and the one the `excluded.still_path` comment in
       * `db/access.ts` exists to explain. `still_path` is borrowed like every column
       * beside it, so the last thing TMDB said wins **including its silence** — a
       * refresh that only ever filled the column in would leave the rail rendering a
       * broken image against a path the CDN has stopped serving.
       */
      const candidate = await seedTitle(tx, { kind: "show" });
      const tmdbEpisodeId = nextNumber() + 900_000;
      const withStill = (stillPath: string | null) =>
        mirrorFor(candidate.kind, candidate.tmdbId, {
          episodes: [
            {
              tmdbEpisodeId,
              seasonNo: 1,
              episodeNo: 1,
              name: "Winter Is Coming",
              airDate: "2011-04-17",
              runtimeMins: 62,
              stillPath,
            },
          ],
        });

      await refreshTitleMirror(withStill("/winter-is-coming.jpg"), tx);
      expect(await stillPathOf(tx, candidate.id)).toBe("/winter-is-coming.jpg");

      // The same episode, refreshed a night later, with the still gone upstream.
      await refreshTitleMirror(withStill(null), tx);
      expect(await stillPathOf(tx, candidate.id)).toBeNull();
    }));
});

/**
 * The `/find` lookup the 404 path makes — and a throw, because no test in this file
 * reaches that path. Every failure seeded here is a `500` or an unreachable TMDB, which
 * is *MediaSafe could not do this* and not *the id is gone*. The 404 path is issue #116's
 * and lives in `tests/title-reconciliation.test.ts`; this stub is what makes a test that
 * wandered into it fail by name rather than quietly reconciling against nothing.
 */
const neverLookedUp: FindByExternalId = () => {
  throw new Error("findByExternalId must not be reached: no test here 404s");
};

describe("runNightlySweep", () => {
  it("keeps refreshing titles after one of them fails", () =>
    inTransaction(async (tx) => {
      const a = await seedTitle(tx, { metadataRefreshedAt: daysAgo(3) });
      const broken = await seedTitle(tx, { metadataRefreshedAt: daysAgo(2) });
      const c = await seedTitle(tx, { metadataRefreshedAt: daysAgo(1) });

      const fetchMirror: FetchMirror = async (kind, tmdbId) => {
        if (tmdbId === broken.tmdbId) throw new Error("TMDB is unreachable");
        return mirrorFor(kind, tmdbId);
      };

      const outcome = await runNightlySweep(fetchMirror, neverLookedUp, 10, tx);

      expect(outcome.candidates).toBe(3);
      // By title rather than by count since #219, because those titles are what
      // `route.ts` busts the caches of — a run that reported the right number and the
      // wrong titles would leave the wrong accounts stale, and since #225 the wrong
      // catalogue keys unexpired too.
      expect(outcome.refreshed.map(({ id }) => id).sort()).toEqual([a.id, c.id].sort());
      expect(outcome.failures.map((failure) => failure.candidate.id)).toEqual([broken.id]);
      // Named the two that actually landed, not assumed from the count alone: both moved
      // to (approximately) `now()`, and `broken` — the one fetch that threw — kept the
      // timestamp it had, days in the past.
      const recently = Date.now() - 60_000;
      expect((await metadataRefreshedAtOf(tx, a.id)).getTime()).toBeGreaterThan(recently);
      expect((await metadataRefreshedAtOf(tx, c.id)).getTime()).toBeGreaterThan(recently);
      expect((await metadataRefreshedAtOf(tx, broken.id)).getTime()).toBeLessThan(recently);
    }));

  it("does not stamp a title it could not refresh, so it is retried on the next run", () =>
    inTransaction(async (tx) => {
      const brokenRefreshedAt = daysAgo(4);
      const broken = await seedTitle(tx, { metadataRefreshedAt: brokenRefreshedAt });

      const fetchMirror: FetchMirror = async () => {
        throw new Error("TMDB answered 500 for /tv/1");
      };

      await runNightlySweep(fetchMirror, neverLookedUp, 10, tx);

      const after = await metadataRefreshedAtOf(tx, broken.id);
      expect(after.getTime()).toBe(brokenRefreshedAt.getTime());

      // Not just unstamped — actually still in the queue next time this runs.
      const nextRun = await titlesDueForRefresh(10, tx);
      expect(nextRun.map((row) => row.id)).toContain(broken.id);
    }));
});
