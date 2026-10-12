import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import {
  seedShowWithSeason,
  seedWatchingShow,
  type SeededTitle,
} from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #357 — one app on every screen. What a reader sees, driven the way a reader drives
 * it: the same five destinations on a phone and a desktop, Settings reached from You, and a
 * poster that opens its title's own page wherever it is clicked.
 *
 * Its own fixture account, for `poster-morph.spec.ts`'s reason: these need a library with
 * a show in it, and the shared account `pending-hold.spec.ts` depends on staying empty is
 * not that.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const DESTINATIONS = ["Tonight", "Coming up", "Search", "Library", "You"];

let seeded: SeededTitle;
let userId: string;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  userId = session.userId;
  seeded = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "one-app-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "one-app-session.json") });

/** The visible primary navigation's link names, in order. */
async function destinations(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
  return nav.getByRole("link").allInnerTexts().then((names) => names.map((name) => name.trim()));
}

test("a phone and a desktop carry the same five destinations, in the same order", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/up-next");
  expect(await destinations(page)).toEqual(DESTINATIONS);

  await page.setViewportSize(DESKTOP);
  await page.goto("/up-next");
  expect(await destinations(page)).toEqual(DESTINATIONS);
});

test("Settings is reached from You", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/you");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("Tonight is called Tonight, and Coming up is a destination of its own", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/up-next");

  await expect(page.getByRole("heading", { name: "Tonight", level: 1 })).toBeVisible();
  // Charcoal, issue #400: the show watched most recently leads, over its artwork, and the
  // rest of Continue watching is *Also ready* under it — there is no *Continue watching*
  // heading any more.
  await expect(page.locator("[data-featured]")).toBeVisible();
  // Issue #399: the landing pager is gone, so there is no second page to page to.
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Primary" })
    .filter({ visible: true })
    .getByRole("link", { name: "Coming up" })
    .click();
  await expect(page).toHaveURL(/\/coming-up$/);
  await expect(page.getByRole("heading", { name: "Coming up", level: 1 })).toBeVisible();
});

test("clicking a library poster on a desktop opens the title's own page", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/library");

  await page.getByRole("button", { name: new RegExp(seeded.titleName) }).click();
  await expect(page).toHaveURL(new RegExp(`/titles/${seeded.libraryEntryId}$`));
});

// ── The title page ──────────────────────────────────────────────────────────────────

test("Mark season watched records the season, and its chip takes a tick", async ({ page }) => {
  const show = await seedShowWithSeason(userId, { episodes: 4, watched: [1] });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/titles/${show.libraryEntryId}`);

  await page.getByRole("button", { name: "Mark season watched" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record 3 episodes" }).click();

  await expect(page.getByRole("button", { name: "Season 1, watched" })).toBeVisible();

  // And it is written, not only drawn: a reload reads it back.
  await page.reload();
  await expect(page.getByRole("button", { name: "Season 1, watched" })).toBeVisible();
});

test("a watched episode can be un-watched with the keyboard alone", async ({ page }) => {
  const show = await seedShowWithSeason(userId, { episodes: 2, watched: [1] });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/titles/${show.libraryEntryId}`);

  const watchedMark = page.getByRole("button", { name: /Episode 1 — Fixture Episode 1, watched/ });
  await watchedMark.focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("dialog");
  await menu.getByRole("button", { name: "Unwatch" }).focus();
  await page.keyboard.press("Enter");
  await menu.getByRole("button", { name: "Unwatch it" }).focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("button", { name: /Mark Season 1, Episode 1 — Fixture Episode 1 watched/ }),
  ).toBeVisible();
});

test("marking an episode with gaps before it offers to mark those too", async ({ page }) => {
  const show = await seedShowWithSeason(userId, { episodes: 4, watched: [] });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/titles/${show.libraryEntryId}`);

  await page.getByRole("button", { name: /Mark Season 1, Episode 3 — Fixture Episode 3 watched/ }).click();
  await page.getByRole("status").getByRole("button", { name: "Also mark 2 earlier" }).click();

  for (const number of [1, 2, 3]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`Episode ${number} — Fixture Episode ${number}, watched`) }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: /Mark Season 1, Episode 4 — Fixture Episode 4 watched/ }),
  ).toBeVisible();
});

test("giving up moves a show into Dropped, and resuming takes it back out", async ({ page }) => {
  const show = await seedShowWithSeason(userId, { episodes: 3, watched: [1] });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/titles/${show.libraryEntryId}`);

  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: "Give up on this show" }).click();
  await expect(page.getByText("Dropped", { exact: true })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("button", { name: "Dropped" }).click();
  await expect(page.getByRole("button", { name: new RegExp(show.titleName) })).toBeVisible();

  await page.goto(`/titles/${show.libraryEntryId}`);
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: "Resume watching" }).click();
  await expect(page.getByText("Dropped", { exact: true })).toHaveCount(0);
});

// ── Search ──────────────────────────────────────────────────────────────────────────

test("one search finds films and shows together, in two groups", async ({ page }) => {
  // Search reaches the live catalogue. A placeholder token (a `test-` prefix, as the
  // local `.env` carries) cannot, so the property is unprovable here rather than failing.
  test.skip(
    (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-"),
    "needs a real TMDB_READ_ACCESS_TOKEN",
  );

  await page.setViewportSize(DESKTOP);
  await page.goto("/search");
  await page.getByLabel("Search films and shows").fill("Severance");

  await expect(page.getByRole("heading", { name: "Shows", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Films", level: 2 })).toBeVisible();
});

// ── Library and lists ───────────────────────────────────────────────────────────────

test("a phone reaches Lists from Library even with no lists yet", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/library");

  await page.getByRole("button", { name: "Lists", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /list/i })).toBeVisible();
});

test("a title taken off a list, and a renamed list, both survive a reload", async ({ page }) => {
  const kept = await seedShowWithSeason(userId, { episodes: 1, watched: [] });
  const dropped = await seedShowWithSeason(userId, { episodes: 1, watched: [] });

  await page.setViewportSize(DESKTOP);

  // Make a list with both titles through the app itself.
  for (const title of [kept, dropped]) {
    await page.goto(`/titles/${title.libraryEntryId}`);
    await page.getByRole("button", { name: `Add ${title.titleName} to a list` }).click();
    const dialog = page.getByRole("dialog");
    if (title === kept) {
      await dialog.getByRole("textbox").fill("E2E Shelf");
      await dialog.getByRole("textbox").press("Enter");
    } else {
      await dialog.getByRole("button", { name: "Add to E2E Shelf" }).click();
    }
    await dialog.getByRole("button", { name: "Done" }).click();
  }

  await page.goto("/library?view=lists");
  await page.getByRole("link", { name: /E2E Shelf/ }).click();

  await page.getByRole("button", { name: `Take ${dropped.titleName} off this list` }).click();
  await expect(page.getByRole("status")).toContainText("Taken off E2E Shelf.");

  await page.getByRole("button", { name: "Rename E2E Shelf" }).click();
  await page.getByRole("textbox", { name: "List name" }).fill("E2E Shelf Renamed");
  await page.getByRole("button", { name: "Save" }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Shelf Renamed", level: 1 })).toBeVisible();
  await expect(page.getByText(kept.titleName)).toBeVisible();
  await expect(page.getByText(dropped.titleName)).toHaveCount(0);
});
