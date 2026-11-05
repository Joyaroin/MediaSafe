import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/neon-serverless";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedFixtureSession } from "./support/fixture-session";
import { seedListOfFilms, seedWatchingShow } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #465 — the small controls answer the finger too: the Library filter chips, the
 * season chips (the same component, `chip.tsx`), the segmented control, search's two pills
 * in one row, the list take-off ✕ and *See all*. `tests/press-spring.test.ts` proves the
 * stylesheet and the call-site roster; this proves what a reader actually gets, the way
 * `press-reaches-surfaces.spec.ts` does for the surface register — a real pointer held
 * down over a real element, and the computed `transform` it produces.
 *
 * Season chips are not reproven here: `season-chips.tsx` renders no markup of its own,
 * only `ChipButton` (`chip.tsx`), which the Library filter chip test below exercises
 * directly — a second browser round trip over the identical component would prove nothing
 * a real device doesn't already share with the first.
 */

const DESKTOP = { width: 1280, height: 900 };

/** Search reaches the live catalogue. A placeholder token (a `test-` prefix, as the local
 *  `.env` carries) cannot, so the property is unprovable here rather than failing — the
 *  same skip `press-reaches-surfaces.spec.ts` and `one-app.spec.ts` already use. */
const NEEDS_LIVE_TMDB = (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-");

/** The matrix a `scale(s)` transform computes to, with no rotation or skew — copied from
 *  `press-reaches-surfaces.spec.ts` rather than imported, since nothing outside `tests/`
 *  shares test-only helpers. */
function scaleOf(transform: string): number {
  const match = transform.match(/^matrix\(([^,]+),\s*([^,]+),/);
  expect(match, `${transform} is not a 2D matrix`).not.toBeNull();
  const [, a, b] = match!;
  expect(Number(b)).toBeCloseTo(0, 5);
  return Number(a);
}

/** Holds the pointer down over `target`'s centre, reads the computed `transform` of
 *  `target` and every one of `others` once the press's own transition (`--dur-press`,
 *  100ms) has had time to settle, then releases the pointer away from the element so no
 *  click is ever dispatched. The first reading is `target`'s own. */
async function pressedTransforms(
  page: Page,
  target: Locator,
  others: readonly Locator[] = [],
): Promise<string[]> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const transforms = await Promise.all(
    [target, ...others].map((locator) => locator.evaluate((el) => getComputedStyle(el).transform)),
  );
  // Away from the element before releasing: a mouseup over the same box as the mousedown
  // is a click, and several of these targets navigate or write on one.
  await page.mouse.move(0, 0);
  await page.mouse.up();

  return transforms;
}

/**
 * `count` films already released, standing at Watchlist — `db/access.ts`'s
 * `listWatchlistFilms` own membership: a watchlist film, undated or dated in the future,
 * is *awaited*, not *ready*, and does not reach Tonight's list at all. `fixture-library.ts`'s
 * own `seedWatchlistFilms` dates every film a day into the *future* on purpose, for the
 * rail that scrolls awaited titles — the opposite of what Tonight's own list needs, so this
 * writes the same two rows (`title`, `libraryEntry`, no `watch`) with a date well in the
 * past instead.
 */
async function seedReadyWatchlistFilms(userId: string, count: number): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const releaseDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (let index = 0; index < count; index += 1) {
      const unique = randomUUID();
      const [titleRow] = await db
        .insert(schema.title)
        .values({
          kind: "film",
          tmdbId: Math.floor(Math.random() * 200_000_000),
          name: `E2E Fixture Ready Film ${unique}`,
          releaseYear: new Date(releaseDate).getUTCFullYear(),
          releaseDate,
          posterPath: `/e2e-fixture-${unique}.jpg`,
        })
        .returning({ id: schema.title.id });

      await db.insert(schema.libraryEntry).values({ userId, titleId: titleRow.id });
    }
  } finally {
    await pool.end();
  }
}

test.describe("one account, for every small control this ticket presses", () => {
  let userId: string;

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    userId = session.userId;

    // Library's filter chips render only once the library holds something
    // (`library-surface.tsx`'s own `entries.length > 0` gate) — one watching show is
    // enough, and it opens on Shows, the default tab, where the chips live.
    await seedWatchingShow(userId);

    const authDir = path.join(__dirname, ".auth");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      path.join(authDir, "press-small-controls-session.json"),
      JSON.stringify(toStorageState(session), null, 2),
    );
  });

  test.use({
    storageState: path.join(__dirname, ".auth", "press-small-controls-session.json"),
  });

  test("a Library filter chip's computed transform scales down while pressed, at the small-control depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/library");

    const main = page.getByRole("main");
    const chip = main.getByRole("button", { name: "Watching", exact: true });
    await expect(chip).toBeVisible();

    const resting = await chip.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, chip);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.92, 2);

    // Released, back to resting — the compression is a transition and not a stuck state.
    await page.waitForTimeout(200);
    expect(await chip.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("the Shows/Films/Lists segmented control scales down while pressed, at the small-control depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/library");

    const group = page.getByRole("main").getByRole("group", { name: "What to show" });
    const option = group.getByRole("button", { name: "Lists", exact: true });
    await expect(option).toBeVisible();

    const resting = await option.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, option);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.92, 2);
  });

  test("Up next's *See all N* scales down while pressed, at the small-control depth", async ({
    page,
  }) => {
    // Six films ready to watch, none pending or Ongoing, puts the whole-screen list over
    // Tonight's own `FIRST_SHOWN` (5) — the one watching show from `beforeAll` is still
    // featured above it, which does not change `count`.
    await seedReadyWatchlistFilms(userId, 6);

    await page.setViewportSize(DESKTOP);
    await page.goto("/up-next");

    const seeAll = page.getByRole("main").getByRole("button", { name: /^See all 6$/ });
    await expect(seeAll).toBeVisible();

    const resting = await seeAll.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, seeAll);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.92, 2);
  });

  test("a list's take-off ✕ scales down while pressed, and presses alone — the poster link beside it never moves", async ({
    page,
  }) => {
    const { listId } = await seedListOfFilms(userId, [
      "Alpha E2E Small-Control Film",
      "Bravo E2E Small-Control Film",
    ]);

    await page.setViewportSize(DESKTOP);
    await page.goto(`/lists/${listId}`);

    const main = page.getByRole("main");
    const takeOff = main.getByRole("button", {
      name: "Take Alpha E2E Small-Control Film off this list",
      exact: true,
    });
    await expect(takeOff).toBeVisible();

    // The poster link is a sibling of the ✕ inside the same cell, not an ancestor of it —
    // `list-icon-grid.tsx`'s own reasoning for why pressing the ✕ needs no guard against
    // compressing it. Found through the cell the ✕ shares with it, rather than by name:
    // the link's accessible name is the poster, the numeral and the title all run
    // together, which a locator by role and name would have to half-guess.
    const cell = takeOff.locator("xpath=ancestor::li[1]");
    const posterLink = cell.getByRole("link");
    await expect(posterLink).toBeVisible();

    const restingTakeOff = await takeOff.evaluate((el) => getComputedStyle(el).transform);
    const restingLink = await posterLink.evaluate((el) => getComputedStyle(el).transform);
    expect(restingTakeOff).toBe("none");
    expect(restingLink).toBe("none");

    const [pressed, linkWhileTakeOffPressed] = await pressedTransforms(page, takeOff, [
      posterLink,
    ]);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.92, 2);
    // Pressed alone: the link beside it, read mid-gesture, never left rest.
    expect(linkWhileTakeOffPressed).toBe("none");
  });

  test("search's two pills in one row press the same way as each other", async ({ page }) => {
    test.skip(NEEDS_LIVE_TMDB, "needs a real TMDB_READ_ACCESS_TOKEN");

    await page.setViewportSize(DESKTOP);
    await page.goto("/search");
    const main = page.getByRole("main");
    await main.getByLabel("Search films and shows").fill("Fight Club");

    // Scoped to the Films group, not merely to the page: TMDB answers "Fight Club" with
    // both a film and at least one show of the same name, and a show's second pill reads
    // *I've seen it all*, not *I've seen it* — the wrong row would silently prove the wrong
    // label. `<section aria-labelledby="search-film-h">` (`search-surface.tsx`'s `Groups`)
    // is an accessible "region" named by its own `<h2>`.
    const filmsGroup = main.getByRole("region", { name: "Films" });
    const row = filmsGroup.getByRole("listitem").filter({ hasText: "Fight Club" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const addWatched = row.getByRole("button", { name: /^Add Fight Club to your library as watched$/ });
    const add = row.getByRole("button", { name: "Add Fight Club to your library", exact: true });
    await expect(addWatched).toBeVisible();
    await expect(add).toBeVisible();

    const restingAddWatched = await addWatched.evaluate((el) => getComputedStyle(el).transform);
    const restingAdd = await add.evaluate((el) => getComputedStyle(el).transform);
    expect(restingAddWatched).toBe("none");
    expect(restingAdd).toBe("none");

    // The two pills press the same way as each other — both at the small-control depth —
    // and each presses alone: pressing one never moves the other.
    const [addWatchedPressed, addWhileAddWatchedPressed] = await pressedTransforms(
      page,
      addWatched,
      [add],
    );
    expect(addWatchedPressed).not.toBe("none");
    expect(scaleOf(addWatchedPressed)).toBeCloseTo(0.92, 2);
    expect(addWhileAddWatchedPressed).toBe("none");

    const [addPressed, addWatchedWhileAddPressed] = await pressedTransforms(page, add, [
      addWatched,
    ]);
    expect(addPressed).not.toBe("none");
    expect(scaleOf(addPressed)).toBeCloseTo(0.92, 2);
    expect(addWatchedWhileAddPressed).toBe("none");
  });
});
