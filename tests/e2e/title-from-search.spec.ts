import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * The title page's one-time hint for a reader sent from Search — issue #553, spec #535's
 * "Pick an episode". `/titles/{entryId}?from=search#episodes` opens at the episode list
 * and says what to do there; the same page without the param shows no hint.
 *
 * The show has thirty aired episodes so the list sits well below the hero on both
 * viewports: "opens at the episodes" is only a claim if the page had to scroll to get there.
 */

const HINT = "Tick the last episode you've seen, then use Also mark earlier.";

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedShowWithSeason(session.userId, { episodes: 30, watched: [] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-from-search-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-from-search-session.json") });

for (const { label, width, height } of [
  { label: "phone", width: 390, height: 844 },
  { label: "desktop", width: 1280, height: 860 },
] as const) {
  test(`?from=search#episodes opens at the episode list and shows the hint, ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/titles/${show.libraryEntryId}?from=search#episodes`);

    const episodes = page.locator("#episodes");
    await expect(episodes).toBeVisible();
    await expect(page.getByText(HINT)).toBeVisible();
    // The hint sits inside the episodes region, above the list it talks about.
    await expect(episodes.getByText(HINT)).toBeVisible();
    const hintBox = await page.getByText(HINT).boundingBox();
    const firstRow = await episodes.getByRole("listitem").first().boundingBox();
    expect(hintBox!.y).toBeLessThan(firstRow!.y);

    // The page was scrolled there — the setup this test claims. The hint and the first
    // episode are on screen, not a screen's height below it. Not "the region's top is at 0":
    // the synopsis streams in above it after the scroll (#218) and can nudge it down.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByText(HINT)).toBeInViewport();
    await expect(episodes.getByRole("listitem").first()).toBeInViewport();
  });

  test(`without the param there is no hint and the page opens at the top, ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/titles/${show.libraryEntryId}`);

    await expect(page.getByRole("heading", { level: 1, name: show.titleName })).toBeVisible();
    // The list is there, so a missing hint is the page's choice and not a missing list.
    await expect(page.locator("#episodes")).toBeVisible();
    await expect(page.getByText(HINT)).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`a different from value shows no hint, ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/titles/${show.libraryEntryId}?from=elsewhere#episodes`);
    await expect(page.locator("#episodes")).toBeVisible();
    await expect(page.getByText(HINT)).toHaveCount(0);
  });
}
