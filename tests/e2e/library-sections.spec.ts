import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFilm } from "./support/fixture-film";
import { seedFixtureSession } from "./support/fixture-session";
import {
  seedShowWithSeason,
  seedWatchlistFilms,
  type SeededTitle,
} from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #552 — Library is grouped into sections by state, each with a row of posters, a count
 * that opens the section's full grid, and (in the grid only) a sort, a back control and
 * hold-to-select. Tonight's Not started group links to the Not started grid.
 *
 * Two fixture accounts, because the cases need different libraries:
 *
 * - *mixed*: a show in each of Watching, Not started (two), Waiting for new episodes and
 *   Dropped, and a film in each of To watch, Coming soon, Watched and Dropped. No Finished
 *   show, so that section's absence is the "empty sections are hidden" proof, and
 *   `?section=finished` is the empty grid.
 * - *many*: fourteen Not started shows, two more than a row holds.
 *
 * The posters are the fixture's (no TMDB image is fetched), so a cell is found by its name.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const AUTH = path.join(__dirname, ".auth");

let watching: SeededTitle;
let notStarted: SeededTitle[];
let waiting: SeededTitle;
let dropped: SeededTitle;
let toWatch: SeededTitle;
let comingSoon: string;
let watched: SeededTitle;
let droppedFilm: SeededTitle;
let many: SeededTitle[];

test.beforeAll(async () => {
  mkdirSync(AUTH, { recursive: true });

  const mixed = await seedFixtureSession();
  watching = await seedShowWithSeason(mixed.userId, { episodes: 4, watched: [1] });
  // Oldest first: `notStarted[1]` is the newest added.
  notStarted = [];
  for (let at = 0; at < 2; at += 1) {
    notStarted.push(await seedShowWithSeason(mixed.userId, { episodes: 3, watched: [] }));
  }
  // Every episode watched, and the fixture show is still in production: caught up.
  waiting = await seedShowWithSeason(mixed.userId, { episodes: 2, watched: [1, 2] });
  dropped = await seedShowWithSeason(mixed.userId, { episodes: 3, watched: [], abandoned: true });
  toWatch = await seedFilm(mixed.userId, { released: true });
  [comingSoon] = await seedWatchlistFilms(mixed.userId, 1);
  watched = await seedFilm(mixed.userId, { watched: true });
  droppedFilm = await seedFilm(mixed.userId, { watched: true, abandoned: true });
  writeFileSync(
    path.join(AUTH, "library-sections-mixed.json"),
    JSON.stringify(toStorageState(mixed), null, 2),
  );

  const crowded = await seedFixtureSession();
  many = [];
  for (let at = 0; at < 14; at += 1) {
    many.push(await seedShowWithSeason(crowded.userId, { episodes: 1, watched: [] }));
  }
  writeFileSync(
    path.join(AUTH, "library-sections-many.json"),
    JSON.stringify(toStorageState(crowded), null, 2),
  );
});

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const cell = (scope: Locator | Page, title: { titleName: string } | string) =>
  scope.getByRole("button", {
    name: new RegExp(typeof title === "string" ? title : title.titleName),
  });
const headings = async (page: Page) =>
  (await page.getByRole("heading", { level: 2 }).allTextContents()).map((text) => text.trim());
// By role, not label: for a moment after a load React's streamed copy of the page waits in a
// hidden div, and a label lookup counts it too (`one-app.spec.ts` has the same note).
const sortControl = (page: Page) => page.getByRole("combobox", { name: "Sort the library" });

/** Names in the order a list is drawn. The cell's accessible name leads with the title. */
async function drawnNames(list: Locator): Promise<string[]> {
  const names = await list.getByRole("button").allTextContents();
  return names.map((text) => /E2E Fixture \w+ [0-9a-f-]{36}/.exec(text)?.[0] ?? text);
}

test.describe("the mixed library", () => {
  test.use({ storageState: path.join(AUTH, "library-sections-mixed.json") });

  for (const [device, size] of [
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`Shows are sections in order, empty ones hidden, Dropped closed, on a ${device}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/library?view=show");

      await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
      // Finished has no show, so it is not drawn; the rest are, in the spec's order.
      await expect.poll(() => headings(page)).toEqual([
        "Watching",
        "Not started",
        "Waiting for new episodes",
        "Dropped",
      ]);

      // No status chips remain.
      for (const chip of ["All", "Caught up", "Watchlist"]) {
        await expect(page.getByRole("button", { name: chip, exact: true })).toHaveCount(0);
      }
      // The sort is the full grid's, not the sections'.
      await expect(sortControl(page)).toHaveCount(0);

      await expect(cell(section(page, "Watching"), watching)).toBeVisible();
      await expect(cell(section(page, "Waiting for new episodes"), waiting)).toBeVisible();
      // Not started: newest added first.
      expect(await drawnNames(section(page, "Not started").getByRole("list"))).toEqual([
        notStarted[1].titleName,
        notStarted[0].titleName,
      ]);

      // Dropped is closed: its disclosure says so, and its poster is not on the page.
      const disclosure = page.getByRole("button", { name: "Dropped", exact: true });
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await expect(cell(page, dropped)).toHaveCount(0);

      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expect(cell(section(page, "Dropped"), dropped)).toBeVisible();

      // Closed again on the next visit.
      await page.reload();
      await expect(page.getByRole("button", { name: "Dropped", exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  }

  test("Films are sections in order, and a finished film is Watched", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/library?view=film");

    await expect.poll(() => headings(page)).toEqual([
      "To watch",
      "Coming soon",
      "Watched",
      "Dropped",
    ]);
    await expect(cell(section(page, "To watch"), toWatch)).toBeVisible();
    await expect(cell(section(page, "Coming soon"), comingSoon)).toBeVisible();
    await expect(cell(section(page, "Watched"), watched)).toBeVisible();
    // A dropped film that has a watch is under Dropped, not Watched.
    await expect(cell(section(page, "Watched"), droppedFilm)).toHaveCount(0);

    await page.getByRole("button", { name: "Dropped", exact: true }).click();
    await expect(cell(section(page, "Dropped"), droppedFilm)).toBeVisible();
  });

  test("a section's count opens its grid, with sort and back, and back returns to the sections", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/library?view=show");

    await page.getByRole("link", { name: "2 in Not started, see all" }).click();
    await expect(page).toHaveURL(/\/library\?view=show&section=not-started$/);

    await expect(page.getByRole("heading", { name: "Not started", level: 1 })).toBeVisible();
    await expect(sortControl(page)).toBeVisible();
    // The section's own order is the default, and the control says so.
    await expect(sortControl(page)).toHaveValue("");
    await expect(page.getByRole("link", { name: "Back to Library" })).toBeVisible();
    await expect(cell(page, notStarted[0])).toBeVisible();
    await expect(cell(page, notStarted[1])).toBeVisible();
    // Another section's posters are not in this grid.
    await expect(cell(page, watching)).toHaveCount(0);

    await page.getByRole("link", { name: "Back to Library" }).click();
    await expect(page).toHaveURL(/\/library\?view=show$/);
    await expect(page.getByRole("heading", { name: "Watching", level: 2 })).toBeVisible();
    await expect(sortControl(page)).toHaveCount(0);
  });

  test("back from a film section returns to the Films tab", async ({ page }) => {
    await page.goto("/library?view=film&section=dropped");

    await expect(page.getByRole("heading", { name: "Dropped", level: 1 })).toBeVisible();
    await expect(cell(page, droppedFilm)).toBeVisible();
    // `dropped` read with `view=film` is the films': the dropped show is not in this grid.
    await expect(cell(page, dropped)).toHaveCount(0);

    await page.getByRole("link", { name: "Back to Library" }).click();
    await expect(page).toHaveURL(/\/library\?view=film$/);
    await expect(page.getByRole("heading", { name: "To watch", level: 2 })).toBeVisible();
  });

  test("an unknown section shows the sections, and an empty section shows its empty grid", async ({
    page,
  }) => {
    await page.goto("/library?view=show&section=nonsense");
    await expect(page.getByRole("heading", { name: "Watching", level: 2 })).toBeVisible();
    await expect(sortControl(page)).toHaveCount(0);

    await page.goto("/library?view=show&section=finished");
    await expect(page.getByRole("heading", { name: "Finished", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing in Finished" })).toBeVisible();
    await expect(sortControl(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Library" })).toBeVisible();
  });

  test("a hold selects in a section's grid and does nothing in a row", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const selectedBar = page.getByRole("navigation", { name: "Selected titles" });

    // The row: hold past the hold time, and nothing is selected.
    await page.goto("/library?view=show");
    const inRow = cell(section(page, "Not started"), notStarted[1]);
    const rowBox = await inRow.boundingBox();
    expect(rowBox).not.toBeNull();
    await page.mouse.move(rowBox!.x + rowBox!.width / 2, rowBox!.y + rowBox!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await expect(selectedBar).toHaveCount(0);
    await page.mouse.up();

    // The grid, same hold: the title is selected. That the same gesture works here is what
    // makes the row's nothing a result and not a gesture this harness cannot make.
    await page.goto("/library?view=show&section=not-started");
    const inGrid = cell(page, notStarted[1]);
    const gridBox = await inGrid.boundingBox();
    expect(gridBox).not.toBeNull();
    await page.mouse.move(gridBox!.x + gridBox!.width / 2, gridBox!.y + gridBox!.height / 2);
    await page.mouse.down();
    await expect(selectedBar).toBeVisible();
    await expect(selectedBar).toContainText("1 selected");
    await page.mouse.up();
  });

  test("Tonight's Not started group links to the Not started grid", async ({ page }) => {
    await page.goto("/up-next");

    const group = page.getByRole("region", { name: "Not started" });
    await expect(group.getByRole("heading", { name: "Not started" })).toBeVisible();
    await group.getByRole("link", { name: "See all" }).click();

    await expect(page).toHaveURL(/\/library\?view=show&section=not-started$/);
    await expect(page.getByRole("heading", { name: "Not started", level: 1 })).toBeVisible();
    await expect(cell(page, notStarted[0])).toBeVisible();
    await expect(cell(page, notStarted[1])).toBeVisible();
  });
});

test.describe("a section longer than its row", () => {
  test.use({ storageState: path.join(AUTH, "library-sections-many.json") });

  for (const [device, size] of [
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`the row holds twelve posters, scrolls sideways, and the count is the whole section, on a ${device}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/library?view=show");

      const row = section(page, "Not started").getByRole("list");
      await expect(row.getByRole("listitem")).toHaveCount(12);
      // The count is the section's, not the row's.
      await expect(page.getByRole("link", { name: "14 in Not started, see all" })).toBeVisible();

      // The setup: twelve cells overflow the row at this width, so there is somewhere to go.
      const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeGreaterThan(0);
      expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);

      const box = await row.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(300, 0);
      await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    });
  }

  test("the grid holds all fourteen, newest first, and sorting reorders them", async ({
    page,
  }) => {
    await page.goto("/library?view=show&section=not-started");

    const grid = page.getByRole("list", { name: "Not started" });
    const newestFirst = [...many].reverse().map((one) => one.titleName);
    await expect(grid.getByRole("listitem")).toHaveCount(14);
    expect(await drawnNames(grid)).toEqual(newestFirst);

    await sortControl(page).selectOption({ label: "Title A–Z" });
    await expect(page).toHaveURL(/\/library\?view=show&section=not-started&sort=title$/);

    const byName = [...newestFirst].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    // The reorder is the claim: the two orders differ, so a grid that ignored `?sort=` fails.
    expect(byName).not.toEqual(newestFirst);
    await expect.poll(() => drawnNames(grid)).toEqual(byName);
  });
});
