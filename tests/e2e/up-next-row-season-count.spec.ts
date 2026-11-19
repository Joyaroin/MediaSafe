import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #538 — a Tonight row counts progress by the season ("2 of 6 this season"), the
 * unit the featured slot prints, and no row says "+N remaining". The strings are
 * unit-tested; this is the one property only a browser shows: that the row on screen
 * carries the count, and moves it with a mark and back with Undo.
 *
 * Its own fixture account, for `up-next-season-progress.spec.ts`'s reason: the shared one
 * must stay empty.
 */

let row: SeededTitle;
let featured: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Seeded first, so its last watch is the older one and it is a row. The second is the
  // show watched most recently, which takes the featured slot.
  row = await seedShowWithSeason(session.userId, { episodes: 6, watched: [1, 2] });
  featured = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-row-season-count-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "up-next-row-season-count-session.json"),
});

const rowOf = (page: Page) =>
  page.locator("li", { has: page.getByRole("link", { name: new RegExp(row.titleName) }) });

test("a Tonight row counts the season, moves it on a mark and back on Undo", async ({ page }) => {
  await page.goto("/up-next");

  // The setup: the featured slot holds the other show, so this one really is a row.
  await expect(
    page.locator("[data-featured]").getByRole("link", { name: new RegExp(featured.titleName) }),
  ).toBeVisible();
  await expect(page.locator("[data-featured]")).not.toContainText(row.titleName);

  await expect(rowOf(page)).toBeVisible();
  await expect(rowOf(page)).toContainText("S01 · E03 · Fixture Episode 3");
  await expect(rowOf(page)).toContainText("2 of 6 this season");
  await expect(rowOf(page)).not.toContainText("remaining");

  await rowOf(page).getByRole("button", { name: /^Mark .* watched$/ }).click();
  await expect(rowOf(page)).toContainText("3 of 6 this season");
  await expect(rowOf(page)).not.toContainText("remaining");

  await rowOf(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect(rowOf(page)).toContainText("2 of 6 this season");
});
