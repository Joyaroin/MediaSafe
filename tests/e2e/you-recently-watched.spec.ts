import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #371 in a real browser: You lists what the reader watched recently, and a row
 * opens its title. Its own account, for `up-next-restart.spec.ts`'s reason — the shared one
 * stays empty. `seedWatchingShow` marks the pilot now, so its day is *Today*.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "you-recently-watched-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "you-recently-watched-session.json") });

test("You shows the latest watch, and the row opens its title", async ({ page }) => {
  await page.goto("/you");

  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Recently watched" }),
  });
  const row = section.getByRole("link", { name: `${show.titleName} — S01 · E01 · Pilot, Today` });
  await expect(row).toBeVisible();

  await row.click();
  await page.waitForURL(`**/titles/${show.libraryEntryId}`);
});

test("fits a phone without scrolling the page sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/you");
  await expect(page.getByRole("heading", { name: "Recently watched" })).toBeVisible();

  if (process.env.YOU_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.YOU_SCREENSHOT_DIR}/you-phone.png`, fullPage: true });
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
