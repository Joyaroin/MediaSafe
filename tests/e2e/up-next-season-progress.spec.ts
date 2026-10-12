import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #364 — the season bar across a Continue watching card's poster moves when a mark
 * lands and moves back on Undo. The rule is unit-tested (`seasonProgress`); this is the
 * one property only a browser shows: that the bar on screen follows the card's position.
 *
 * Its own fixture account, for `up-next-restart.spec.ts`'s reason: the shared one must
 * stay empty.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Four aired episodes, the first watched: the card offers episode 2 at one in four.
  show = await seedShowWithSeason(session.userId, { episodes: 4, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-season-progress-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "up-next-season-progress-session.json"),
});

/** The show's row on Tonight, or — when it is the show watched most recently — the featured
 *  block (Charcoal, issue #400), which carries the same title link and the same controls. */
const card = (page: Page) =>
  page.locator("li, [data-featured]", {
    has: page.getByRole("link", { name: new RegExp(show.titleName) }),
  });

/** The watched segments' share of the season, as a whole percentage — the featured
 *  block's one segment per aired episode (handoff §6, Charcoal issue #400). */
async function filled(page: Page): Promise<number> {
  return card(page)
    .locator('[role="img"][aria-label$="episodes this season watched"]')
    .evaluate((segments) => {
      const all = segments.children.length;
      const watched = segments.querySelectorAll("[data-watched]").length;
      return Math.round((watched / all) * 100);
    });
}

test("the season bar advances on a mark and returns on Undo", async ({ page }) => {
  await page.goto("/up-next");
  await expect(card(page)).toBeVisible();
  expect(await filled(page)).toBe(25);

  await card(page).getByRole("button", { name: /^Mark .* watched$/ }).click();
  await expect.poll(() => filled(page)).toBe(50);

  await card(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect.poll(() => filled(page)).toBe(25);
});
