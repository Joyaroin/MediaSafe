import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #367 — marking the last aired episode of a season holds on the finish line rather
 * than *Watched*, and Undo during the hold takes back the line and the mark together. The
 * copy rule is a table in `tests/finish-line.test.ts`; this is the browser half.
 *
 * Its own fixture account, for `up-next-restart.spec.ts`'s reason.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Two aired episodes, the first watched: the card offers the season's last. The show is
  // in production with nothing announced after it, so the line is *Season 1 done*.
  show = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-finish-moment-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "up-next-finish-moment-session.json"),
});

const card = (page: Page) =>
  page.locator("li", { has: page.getByRole("link", { name: new RegExp(show.titleName) }) });

test("marking a season's last episode says so, and Undo takes back the line and the mark", async ({
  page,
}) => {
  await page.goto("/up-next");
  const markButton = card(page).getByRole("button", {
    name: "Mark Season 1, Episode 2 — Fixture Episode 2 watched",
  });
  await expect(markButton).toBeVisible();

  await markButton.click();
  await expect(card(page).getByText("Season 1 done")).toBeVisible();

  await card(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect(card(page).getByText("Season 1 done")).toHaveCount(0);
  await expect(markButton).toBeVisible();

  // The mark is gone from the server too: a fresh load still offers the episode.
  await page.reload();
  await expect(markButton).toBeVisible();
});

test("under reduced motion the line still appears", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/up-next");

  await card(page).getByRole("button", { name: /^Mark .* watched$/ }).click();
  const line = card(page).getByText("Season 1 done");
  await expect(line).toBeVisible();
  // No travel: the entrance is opacity alone.
  expect(await line.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  await card(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect(line).toHaveCount(0);
});
