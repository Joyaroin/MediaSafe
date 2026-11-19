import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #551 — Tonight shows the shows you haven't started, in a **Not started** group under
 * Also ready, and leads with one when nothing is in Continue watching.
 *
 * Two fixture accounts, because the two cases need different libraries (the shared one must
 * stay empty, for `up-next-restart.spec.ts`'s reason):
 *
 * - *busy*: a show in Continue watching, four Not started shows and a Dropped one. Its
 *   Continue watching show is dated a day ahead, so a show the test starts stays behind it
 *   and lands in Also ready after the reload, as the ticket's criterion reads.
 * - *quiet*: two Not started shows and nothing else, so the newest is featured.
 *
 * The tests of one account run in order and share it: the first marks a row away.
 */

let watching: SeededTitle;
let notStarted: SeededTitle[];
let dropped: SeededTitle;
let quiet: SeededTitle[];

const AUTH = path.join(__dirname, ".auth");

test.beforeAll(async () => {
  mkdirSync(AUTH, { recursive: true });

  const busy = await seedFixtureSession();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  watching = await seedShowWithSeason(busy.userId, {
    episodes: 4,
    watched: [1],
    watchedAt: tomorrow,
  });
  // Seeded oldest first, so `notStarted[3]` is the newest added.
  notStarted = [];
  for (let at = 0; at < 4; at += 1) {
    notStarted.push(await seedShowWithSeason(busy.userId, { episodes: 5, watched: [] }));
  }
  dropped = await seedShowWithSeason(busy.userId, { episodes: 5, watched: [], abandoned: true });
  writeFileSync(
    path.join(AUTH, "tonight-not-started-busy.json"),
    JSON.stringify(toStorageState(busy), null, 2),
  );

  const empty = await seedFixtureSession();
  quiet = [];
  for (let at = 0; at < 2; at += 1) {
    quiet.push(await seedShowWithSeason(empty.userId, { episodes: 5, watched: [] }));
  }
  writeFileSync(
    path.join(AUTH, "tonight-not-started-quiet.json"),
    JSON.stringify(toStorageState(empty), null, 2),
  );
});

const featured = (page: Page) => page.locator("[data-featured]");
const group = (page: Page) => page.getByRole("region", { name: "Not started" });
const alsoReady = (page: Page) => page.getByRole("region", { name: "Also ready" });
const rowIn = (scope: ReturnType<Page["locator"]>, show: SeededTitle) =>
  scope.locator("li", { has: scope.page().getByRole("link", { name: new RegExp(show.titleName) }) });

test.describe("with a show in Continue watching", () => {
  test.use({ storageState: path.join(AUTH, "tonight-not-started-busy.json") });

  for (const [device, size] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 900 }],
  ] as const) {
    test(`shows the three newest Not started shows on a ${device}, and no Dropped one`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/up-next");

      // The setup: Continue watching holds a show, so it is featured and the fallback is off.
      await expect(featured(page)).toContainText(watching.titleName);

      await expect(group(page).getByRole("heading", { name: "Not started" })).toBeVisible();
      await expect(group(page).locator("li")).toHaveCount(3);
      // Newest added first, and the fourth-newest is cut.
      await expect(group(page).locator("li").nth(0)).toContainText(notStarted[3].titleName);
      await expect(group(page).locator("li").nth(1)).toContainText(notStarted[2].titleName);
      await expect(group(page).locator("li").nth(2)).toContainText(notStarted[1].titleName);
      await expect(group(page)).not.toContainText(notStarted[0].titleName);
      await expect(page.getByText(dropped.titleName)).toHaveCount(0);

      await expect(group(page).locator("li").nth(0)).toContainText(
        "Start with S01 · E01 · Fixture Episode 1",
      );
      await expect(group(page)).not.toContainText("this season");
      await expect(group(page)).not.toContainText("remaining");
    });
  }

  test("the group is not part of Also ready's count or fold", async ({ page }) => {
    await page.goto("/up-next");
    // Also ready is empty here (the one Continue watching show is featured), so it has no
    // heading and no "See all": three Not started rows must not conjure one.
    await expect(group(page).locator("li")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /^See all/ })).toHaveCount(0);
    await expect(alsoReady(page)).toHaveCount(0);
  });

  test("marking S01 E01 closes the row, and after a reload the show is in Also ready", async ({
    page,
  }) => {
    const started = notStarted[3];
    await page.goto("/up-next");
    await expect(rowIn(group(page), started)).toBeVisible();

    await rowIn(group(page), started)
      .getByRole("button", { name: /^Mark .*, Season 1, Episode 1 — .* watched$/ })
      .click();

    await expect(rowIn(group(page), started)).toHaveCount(0, { timeout: 10_000 });
    // The show is not featured: Continue watching's show still leads.
    await expect(featured(page)).toContainText(watching.titleName);

    await page.reload();
    await expect(rowIn(alsoReady(page), started)).toBeVisible();
    await expect(rowIn(alsoReady(page), started)).toContainText("S01 · E02 · Fixture Episode 2");
    await expect(rowIn(alsoReady(page), started)).toContainText("1 of 5 this season");
    await expect(group(page)).not.toContainText(started.titleName);
    // The fourth-newest has taken the freed place.
    await expect(group(page).locator("li")).toHaveCount(3);
    await expect(featured(page)).toContainText(watching.titleName);
  });
});

test.describe("with nothing in Continue watching", () => {
  test.use({ storageState: path.join(AUTH, "tonight-not-started-quiet.json") });

  test("features the newest Not started show, left out of the group, and moves on to S01 E02", async ({
    page,
  }) => {
    const [older, newest] = quiet;
    await page.goto("/up-next");

    await expect(featured(page)).toContainText(newest.titleName);
    await expect(featured(page)).toContainText("Mark watched");
    await expect(featured(page).getByRole("button", { name: /Season 1, Episode 1 — / })).toBeVisible();
    // Left out of the group, which holds the other show.
    await expect(group(page).locator("li")).toHaveCount(1);
    await expect(group(page)).toContainText(older.titleName);
    await expect(group(page)).not.toContainText(newest.titleName);
    await expect(page.getByText(newest.titleName)).toHaveCount(1);

    await featured(page).getByRole("button", { name: /Season 1, Episode 1 — / }).click();

    // As today's featured block: after the hold it moves on to the next episode.
    await expect(
      featured(page).getByRole("button", { name: /Season 1, Episode 2 — / }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(featured(page)).toContainText(newest.titleName);
    await expect(group(page).locator("li")).toHaveCount(1);
  });
});
