import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Search before you type (issue #542): Recently added, then one rail per kind — *Because
 * you watched* where there is a seed, otherwise *Trending this week*.
 *
 * Two fixture accounts:
 *
 * - *new*: no title at all. Idle Search shows Trending this week for both kinds, no Recently
 *   added, and no Add on any tile.
 * - *seeded*: seven shows, the newest added and watched being a real TMDB show (Breaking
 *   Bad, so that its recommendations exist). Idle Search shows Recently added with exactly
 *   six of them, newest first, Because you watched for shows, and Trending this week for
 *   films — the reader has watched no film.
 *
 * The rails read live TMDB, so, like `search-names.spec.ts`, this skips on a placeholder
 * token. What TMDB ranks is not asserted: only which rail is there, what it links to, and
 * what it does not offer. Failed and empty reads are not reachable from a browser (the read
 * is server-side) and are held in `tests/search-rails.test.ts`.
 */

test.skip(
  (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-"),
  "needs a real TMDB_READ_ACCESS_TOKEN",
);

const AUTH = path.join(__dirname, ".auth");
const SEED_TMDB_ID = 1396;
const SEED_NAME = "Breaking Bad";
const SIZES = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
] as const;

const seededNames: string[] = [];
let seedEntryId = "";

/** The real show, held by the account and watched now — the rail's seed. The title row may
 *  exist already (another run, another account), so it is found before it is made. */
async function seedRealShow(userId: string): Promise<string> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });
  try {
    const existing = await db
      .select({ id: schema.title.id })
      .from(schema.title)
      .where(and(eq(schema.title.kind, "show"), eq(schema.title.tmdbId, SEED_TMDB_ID)));
    const titleId =
      existing[0]?.id ??
      (
        await db
          .insert(schema.title)
          .values({ kind: "show", tmdbId: SEED_TMDB_ID, name: SEED_NAME, releaseYear: 2008 })
          .returning({ id: schema.title.id })
      )[0].id;

    const [entry] = await db
      .insert(schema.libraryEntry)
      .values({ userId, titleId })
      .returning({ id: schema.libraryEntry.id });
    const [episode] = await db
      .insert(schema.episode)
      .values({
        titleId,
        tmdbEpisodeId: randomInt(1_000_000_000, 2_000_000_000),
        seasonNo: 90,
        episodeNo: randomInt(1, 32_000),
        name: "Fixture episode",
        airDate: "2008-01-20",
      })
      .returning({ id: schema.episode.id });
    await db.insert(schema.watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId,
      episodeId: episode.id,
      watchedAt: new Date(),
      source: "e2e-fixture",
      sourceKey: `search-idle-${userId}`,
    });
    return entry.id;
  } finally {
    await pool.end();
  }
}

test.beforeAll(async () => {
  mkdirSync(AUTH, { recursive: true });

  const fresh = await seedFixtureSession();
  writeFileSync(
    path.join(AUTH, "search-idle-new.json"),
    JSON.stringify(toStorageState(fresh), null, 2),
  );

  const seeded = await seedFixtureSession();
  // Six fixture shows, watched long ago so the real show below is the seed; then the real
  // one, last added. Seven in all, so the cap of six has something to cut.
  const longAgo = new Date("2020-01-01T00:00:00Z");
  for (let at = 0; at < 6; at += 1) {
    const show = await seedShowWithSeason(seeded.userId, {
      episodes: 2,
      watched: [1],
      watchedAt: longAgo,
    });
    seededNames.push(show.titleName);
  }
  seedEntryId = await seedRealShow(seeded.userId);
  writeFileSync(
    path.join(AUTH, "search-idle-seeded.json"),
    JSON.stringify(toStorageState(seeded), null, 2),
  );
});

const main = (page: Page) => page.getByRole("main");
const trending = (page: Page) => main(page).getByRole("list", { name: "Trending this week" });
const because = (page: Page) => main(page).getByRole("list", { name: "Because you watched" });
const recent = (page: Page) => main(page).getByRole("list", { name: "Recently added" });

for (const [size, viewport] of SIZES) {
  test.describe(`a new reader, ${size}`, () => {
    test.use({ storageState: path.join(AUTH, "search-idle-new.json"), viewport });

    test("sees Trending this week for both kinds, no Recently added, and no Add", async ({
      page,
    }) => {
      await page.goto("/search");

      // One rail per kind, each its own list.
      await expect(trending(page)).toHaveCount(2);
      await expect(because(page)).toHaveCount(0);
      await expect(main(page).getByRole("heading", { name: "Recently added" })).toHaveCount(0);

      // The rails are of the right kind: the shows' rail links to shows, the films' to films.
      await expect(trending(page).nth(0).getByRole("link").first()).toHaveAttribute(
        "href",
        /^\/catalogue\/show\/\d+$/,
      );
      await expect(trending(page).nth(1).getByRole("link").first()).toHaveAttribute(
        "href",
        /^\/catalogue\/film\/\d+$/,
      );

      // A tile opens a page. It never offers an Add.
      await expect(main(page).getByRole("button", { name: /^Add\b/ })).toHaveCount(0);

      // Pressing a tile does open the catalogue page.
      const first = trending(page).nth(0).getByRole("link").first();
      const href = await first.getAttribute("href");
      await first.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  });

  test.describe(`a reader with a seed, ${size}`, () => {
    test.use({ storageState: path.join(AUTH, "search-idle-seeded.json"), viewport });

    test("sees Recently added first, Because you watched for shows, Trending for films", async ({
      page,
    }) => {
      await page.goto("/search");

      // Recently added: six of the seven, newest first (the real show was added last), and
      // the oldest fixture is the one cut.
      await expect(recent(page).getByRole("listitem")).toHaveCount(6);
      await expect(recent(page).getByRole("listitem").first()).toContainText(SEED_NAME);
      await expect(recent(page)).not.toContainText(seededNames[0]);
      await expect(recent(page)).toContainText(seededNames[5]);

      // It sits above the per-kind rails.
      const headings = await main(page).getByRole("heading", { level: 2 }).allInnerTexts();
      expect(headings.slice(0, 3)).toEqual([
        "Recently added",
        "Because you watched",
        "Trending this week",
      ]);

      // Shows have a seed, so Because you watched names it; films have none, so they trend.
      await expect(because(page)).toHaveCount(1);
      await expect(main(page).getByText(SEED_NAME, { exact: true }).first()).toBeVisible();
      await expect(trending(page)).toHaveCount(1);
      await expect(trending(page).getByRole("link").first()).toHaveAttribute(
        "href",
        /^\/catalogue\/film\/\d+$/,
      );
      await expect(main(page).getByRole("button", { name: /^Add\b/ })).toHaveCount(0);

      // A Recently added tile opens that title's own page.
      await recent(page).getByRole("link").first().click();
      await expect(page).toHaveURL(new RegExp(`/titles/${seedEntryId}`));
    });
  });
}
