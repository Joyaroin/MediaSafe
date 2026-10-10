import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #362 — the show watched most recently is drawn as the featured card, and it keeps
 * every behaviour of a compact card: mark, hold, Undo, advance, and leaving after its last
 * aired episode, when the next show becomes featured.
 *
 * Its own fixture account, for `up-next-restart.spec.ts`'s reason. The tests run in order
 * and share it: the last one marks the featured show off the rail.
 */

let older: SeededTitle;
let latest: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Seeded in this order, so `latest`'s watch is the more recent and it is featured.
  older = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  latest = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-featured-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "up-next-featured-session.json") });

const featured = (page: Page) => page.locator("li[data-featured]");

for (const [device, size] of [
  ["phone", { width: 500, height: 900 }],
  ["desktop", { width: 1280, height: 900 }],
] as const) {
  test(`features the most recently watched show on a ${device}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/up-next");

    await expect(featured(page)).toHaveCount(1);
    await expect(featured(page)).toContainText(latest.titleName);
    await expect(featured(page)).not.toContainText(older.titleName);
  });
}

test("the featured card marks, holds, takes an Undo, and advances like any card", async ({
  page,
}) => {
  await page.goto("/up-next");
  const card = featured(page);

  await card.getByRole("button", { name: /^Mark Season 1, Episode 2 — / }).click();
  await expect(card.getByText("Watched")).toBeVisible();
  await card.getByRole("button", { name: /^Undo marking/ }).click();
  await expect(card.getByRole("button", { name: /^Mark Season 1, Episode 2 — / })).toBeVisible();
  // Let the Undo's write and its render land first: an immediate re-mark is #390's race,
  // with its own spec (`up-next-undo-remark.spec.ts`).
  await page.waitForLoadState("networkidle");

  await card.getByRole("button", { name: /^Mark Season 1, Episode 2 — / }).click();
  // The hold ends and the next episode slides in, still on the featured card.
  await expect(card.getByRole("button", { name: /^Mark Season 1, Episode 3 — / })).toBeVisible();
  await expect(card).toContainText(latest.titleName);
});

test("when the featured show leaves, the next show is featured", async ({ page }) => {
  await page.goto("/up-next");
  const card = featured(page);

  await card.getByRole("button", { name: /^Mark Season 1, Episode 3 — / }).click();
  await expect(card.getByText("Season 1 done")).toBeVisible();

  await expect(featured(page)).toContainText(older.titleName, { timeout: 10_000 });
  await expect(page.getByText(latest.titleName)).toHaveCount(0);
});
