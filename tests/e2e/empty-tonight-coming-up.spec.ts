import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #556 — the empty Tonight and Coming up screens point to Search, and draw no rail of
 * trending titles (that rail, #365, is gone).
 *
 * Two fixture accounts, because the screens differ with the library:
 *
 * - *empty*: no title at all. Tonight offers "Search films and shows" (filled) and "Bring
 *   your library in".
 * - *finished*: two shows watched to the end and over (`inProduction: false`), so Tonight
 *   and Coming up are both empty while the library is not. Tonight offers Search and no
 *   import.
 *
 * Neither test reads TMDB: the rail they pin the absence of was the screen's only call.
 */

const AUTH = path.join(__dirname, ".auth");

test.beforeAll(async () => {
  mkdirSync(AUTH, { recursive: true });

  const empty = await seedFixtureSession();
  writeFileSync(
    path.join(AUTH, "empty-tonight-empty.json"),
    JSON.stringify(toStorageState(empty), null, 2),
  );

  const finished = await seedFixtureSession();
  for (let at = 0; at < 2; at += 1) {
    await seedShowWithSeason(finished.userId, {
      episodes: 3,
      watched: [1, 2, 3],
      inProduction: false,
    });
  }
  writeFileSync(
    path.join(AUTH, "empty-tonight-finished.json"),
    JSON.stringify(toStorageState(finished), null, 2),
  );
});

const SIZES = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
] as const;

const search = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: "Search films and shows" });
const importLink = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: "Bring your library in" });

/** A trending rail drew a list named "Trending this week" or "Because you watched …". */
async function expectNoRail(page: Page) {
  const main = page.getByRole("main");
  await expect(main.getByRole("list", { name: /Trending this week|Because you watched/ })).toHaveCount(0);
  await expect(main.getByText("Trending this week")).toHaveCount(0);
  // No poster card to add from either: the rail's cards linked to the catalogue.
  await expect(main.locator('a[href^="/catalogue/"]')).toHaveCount(0);
  await expect(main.getByRole("button", { name: /^Add / })).toHaveCount(0);
}

async function background(link: ReturnType<typeof search>) {
  return link.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe("with an empty library", () => {
  test.use({ storageState: path.join(AUTH, "empty-tonight-empty.json") });

  for (const [device, size] of SIZES) {
    test(`Tonight offers Search, filled, and Bring your library in on a ${device}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/up-next");

      await expect(
        page.getByRole("main").getByRole("heading", { name: "Nothing queued for tonight" }),
      ).toBeVisible();
      await expect(search(page)).toBeVisible();
      await expect(search(page)).toHaveAttribute("href", "/search");
      await expect(importLink(page)).toBeVisible();
      await expect(importLink(page)).toHaveAttribute("href", "/import");

      // Search is the one filled button: it paints a different background from the import link.
      expect(await background(search(page))).not.toBe(await background(importLink(page)));

      // The rail would load after the page; give it the time the old spec gave TMDB.
      await page.waitForLoadState("networkidle");
      await expectNoRail(page);
    });

    test(`Coming up links to Search and draws no rail on a ${device}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/coming-up");

      await expect(
        page.getByRole("main").getByRole("heading", { name: "No release dates yet" }),
      ).toBeVisible();
      await expect(search(page)).toHaveAttribute("href", "/search");
      await expect(importLink(page)).toHaveCount(0);

      await page.waitForLoadState("networkidle");
      await expectNoRail(page);
    });
  }
});

test.describe("with a library of finished shows", () => {
  test.use({ storageState: path.join(AUTH, "empty-tonight-finished.json") });

  for (const [device, size] of SIZES) {
    test(`Tonight offers Search and no import on a ${device}`, async ({ page }) => {
      await page.setViewportSize(size);

      // The setup: the library is not empty. Two finished shows sit in Library's Finished
      // section (#552): its count says 2 and its row draws two posters.
      await page.goto("/library");
      await expect(page.getByRole("link", { name: "2 in Finished, see all" })).toBeVisible();
      const finished = page.getByRole("region", { name: "Finished", exact: true });
      await expect(finished.getByRole("list").getByRole("listitem")).toHaveCount(2);

      await page.goto("/up-next");
      await expect(
        page.getByRole("main").getByRole("heading", { name: "Nothing queued for tonight" }),
      ).toBeVisible();
      await expect(search(page)).toBeVisible();
      await expect(search(page)).toHaveAttribute("href", "/search");
      await expect(importLink(page)).toHaveCount(0);

      await page.waitForLoadState("networkidle");
      await expectNoRail(page);
    });

    test(`Coming up links to Search and draws no rail on a ${device}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/coming-up");

      await expect(
        page.getByRole("main").getByRole("heading", { name: "No release dates yet" }),
      ).toBeVisible();
      await expect(search(page)).toHaveAttribute("href", "/search");

      await page.waitForLoadState("networkidle");
      await expectNoRail(page);
    });
  }
});
