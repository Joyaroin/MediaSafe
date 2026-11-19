import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  seedShowWithSeason,
  seedUnwatchedTitle,
  seedWatchingShow,
  type SeededTitle,
} from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #555 — the state's word depends on the kind, on both surfaces that print it: the
 * library cell's line under the name, and the title page's state tag. A show with no watches
 * is *Not started*, a caught-up show is *Waiting for new episodes*, a film with no watch is
 * *To watch*. Never *Caught up*, never *Watchlist*.
 *
 * Each title is checked on the real screen, from the seed, so the words come from
 * `stateLabel(kind, state)` applied to the state the database views derived — a label table
 * that was right but not wired to the surface would fail here.
 */

let notStarted: SeededTitle;
let waiting: SeededTitle;
let watching: SeededTitle;
let toWatch: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  notStarted = await seedUnwatchedTitle(session.userId, "show");
  // Two aired episodes, both watched, the show still in production: caught up.
  waiting = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1, 2] });
  watching = await seedWatchingShow(session.userId);
  toWatch = await seedUnwatchedTitle(session.userId, "film");

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "state-labels-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "state-labels-session.json") });

/** The library cell whose name is `title`, found by the link the whole cell is. */
function cellFor(page: Page, title: SeededTitle): Locator {
  return page.getByRole("listitem").filter({ has: page.getByText(title.titleName, { exact: true }) });
}

/** The title page's state tag: the paragraph straight after the name, in the hero. */
function stateTag(page: Page, title: SeededTitle): Locator {
  return page
    .getByRole("heading", { level: 1, name: title.titleName })
    .locator("xpath=preceding-sibling::p[1]");
}

for (const viewport of [
  { label: "phone", size: { width: 390, height: 844 } },
  { label: "desktop", size: { width: 1280, height: 860 } },
]) {
  test(`the library cell prints the new state words, on a ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport.size);

    await page.goto("/library");
    await expect(cellFor(page, notStarted)).toContainText("Not started");
    await expect(cellFor(page, waiting)).toContainText("Waiting for new episodes");
    await expect(cellFor(page, watching)).toContainText("S1 E2 up next");
    // The filter chips still carry the old words until #552 removes them, so the absence
    // is asserted on the cells alone.
    await expect(page.getByRole("listitem").filter({ hasText: "Caught up" })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: "Watchlist" })).toHaveCount(0);

    await page.goto("/library?view=film");
    await expect(cellFor(page, toWatch)).toContainText("To watch");
    await expect(page.getByRole("listitem").filter({ hasText: "Watchlist" })).toHaveCount(0);
  });

  test(`the title page's state tag uses the same words, on a ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport.size);

    for (const [title, word] of [
      [notStarted, "Not started"],
      [waiting, "Waiting for new episodes"],
      [watching, "Watching"],
      [toWatch, "To watch"],
    ] as const) {
      await page.goto(`/titles/${title.libraryEntryId}`);
      await expect(page.getByRole("heading", { level: 1, name: title.titleName })).toBeVisible();
      await expect(stateTag(page, title)).toHaveText(word);
    }
  });
}
