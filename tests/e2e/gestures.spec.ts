import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Charcoal 14, issue #408 — swipe to mark and paint to mark (handoff §11.3), in a browser.
 * The rules are `tests/swipe-to-mark.test.ts` and `tests/paint-to-mark.test.ts`; this holds
 * the bindings to them: what a drag records, what it leaves alone, and the stroke's one Undo.
 *
 * A mouse drives both: the bindings read pointer events, which a mouse sends as a finger
 * does. Its own fixture account, serial, because each test is a write the next one reads.
 */

let swiped: SeededTitle;
let featuredShow: SeededTitle;
let painted: SeededTitle;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  painted = await seedShowWithSeason(session.userId, { episodes: 7, watched: [1] });
  swiped = await seedShowWithSeason(session.userId, { episodes: 4, watched: [1] });
  // Watched last, so it is Tonight's featured show and `swiped` is a row under it.
  featuredShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "gestures-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "gestures-session.json") });

/** A Server Action — every write in this application is one. */
const isAction = (request: Request) =>
  request.method() === "POST" && request.headers()["next-action"] !== undefined;

const row = (page: Page, show: SeededTitle) =>
  page.locator("li", { has: page.getByRole("link", { name: new RegExp(show.titleName) }) });
const markRow = (show: SeededTitle, episode: number) =>
  `Mark ${show.titleName}, Season 1, Episode ${episode} — Fixture Episode ${episode}, watched`;

/** Press at `from`, move by `dx`/`dy` in small steps, and report the tick before letting go. */
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
}

test.describe("swipe a row to mark", () => {
  test("a swipe short of 40px records nothing, and the row does not move", async ({ page }) => {
    await page.goto("/up-next");
    await expect(page.locator("[data-featured]")).toContainText(featuredShow.titleName);
    const target = row(page, swiped);
    await expect(target).toBeVisible();
    const before = await target.boundingBox();

    await drag(page, target, 30, 0);
    // The wash has grown under the finger, but the row itself stayed put.
    const wash = await target
      .locator("[data-swipe-wash]")
      .evaluate((layer) => layer.getBoundingClientRect().width);
    expect(wash).toBeGreaterThan(20);
    expect(wash).toBeLessThan(40);
    expect((await target.boundingBox())!.x).toBe(before!.x);
    await page.mouse.up();

    await expect(target.getByRole("button", { name: markRow(swiped, 2) })).toBeVisible();
    await expect(target.getByRole("button", { name: /^Undo marking/ })).toHaveCount(0);
    // The claimed drag's click is swallowed: the row's link did not navigate.
    await expect(page).toHaveURL(/\/up-next$/);
  });

  test("a mostly vertical drag is the list's, and records nothing", async ({ page }) => {
    await page.goto("/up-next");
    const target = row(page, swiped);
    await drag(page, target, 45, 120);
    await page.mouse.up();

    await expect(target.getByRole("button", { name: markRow(swiped, 2) })).toBeVisible();
    await expect(target.getByRole("button", { name: /^Undo marking/ })).toHaveCount(0);
  });

  test("a press inside the back-gesture edge is left alone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/up-next");
    const target = row(page, swiped);
    const box = (await target.boundingBox())!;

    await page.mouse.move(10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(150, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(target.getByRole("button", { name: /^Undo marking/ })).toHaveCount(0);
  });

  test("past 40px the tick fills, and letting go records the episode", async ({ page }) => {
    await page.goto("/up-next");
    const target = row(page, swiped);

    await drag(page, target, 80, 0);
    // Armed: the tick is drawn filled, as letting go will record.
    await expect(
      target.getByRole("button", { name: markRow(swiped, 2) }).locator("span").first(),
    ).toHaveClass(/\bbg-accent\b/);
    const marked = page.waitForResponse((response) => isAction(response.request()));
    await page.mouse.up();

    // From here it is the mark from a row: the hold, the ring and Undo.
    await expect(target.getByRole("button", { name: /^Undo marking/ })).toBeVisible();
    await expect(page).toHaveURL(/\/up-next$/);
    await expect(target.getByRole("button", { name: markRow(swiped, 3) })).toBeVisible();

    await marked;
    await page.reload();
    // Now the show watched most recently, so it is featured rather than a row.
    await expect(page.getByRole("button", { name: markRow(swiped, 3) })).toBeVisible();
  });
});

test.describe("paint to mark", () => {
  // Tall enough that the whole season is on screen at once: a stroke is drawn over rows the
  // reader can see, and a mouse cannot press outside the viewport.
  test.use({ viewport: { width: 1280, height: 1800 } });

  const episodes = (page: Page) => page.getByRole("region", { name: "Episodes" });
  const tick = (page: Page, episode: number) =>
    episodes(page).getByRole("button", {
      name: `Mark Season 1, Episode ${episode} — Fixture Episode ${episode} watched`,
    });
  const episodeRow = (page: Page, episode: number) =>
    episodes(page).locator("li", { hasText: `Fixture Episode ${episode}` });

  test("a hold that drifts before the ring closes is a scroll, and records nothing", async ({
    page,
  }) => {
    await page.goto(`/titles/${painted.libraryEntryId}`);
    await drag(page, tick(page, 2), 0, 80);
    await page.mouse.up();

    await expect(tick(page, 2)).toBeVisible();
    await expect(page.locator("[data-paint-stroke]")).toHaveCount(0);
  });

  test("hold, drag down, let go: one write for the stroke, and one Undo for all of it", async ({
    page,
  }) => {
    await page.goto(`/titles/${painted.libraryEntryId}`);
    await episodeRow(page, 5).scrollIntoViewIfNeeded();
    const start = (await tick(page, 2).boundingBox())!;
    const fifth = (await episodeRow(page, 5).boundingBox())!;

    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await expect(tick(page, 2).locator("[data-hold-ring]")).toHaveCount(1);
    // The ring closes over the long-press time, and the stroke begins.
    await expect(tick(page, 2)).toHaveAttribute("data-painting", "");

    await page.mouse.move(start.x + start.width / 2, fifth.y + fifth.height / 2, { steps: 16 });
    for (const filled of [2, 3, 4, 5]) {
      await expect(episodeRow(page, filled).locator(".bg-accent").first()).toBeVisible();
    }

    let writes = 0;
    page.on("request", (request) => {
      if (isAction(request)) writes += 1;
    });
    // Waited on by response, not by `networkidle` — on a page already loaded that returns at
    // once, and a reload would then cancel the write it was meant to wait for.
    const marked = page.waitForResponse((response) => isAction(response.request()));
    await page.mouse.up();

    const bar = page.locator("[data-paint-stroke]");
    await expect(bar).toContainText("4 episodes marked");
    // Up next moved to the first episode after the stroke at once.
    await expect(episodeRow(page, 6)).toContainText("Up next");

    await marked;
    expect(writes).toBe(1);

    const undone = page.waitForResponse((response) => isAction(response.request()));
    await bar.getByRole("button", { name: "Undo marking 4 episodes watched" }).click();
    await expect(bar).toHaveCount(0);
    await expect(tick(page, 2)).toBeVisible();
    await expect(episodeRow(page, 2)).toContainText("Up next");

    await undone;
    expect(writes).toBe(2);
    await page.reload();
    for (const unwatched of [2, 3, 4, 5]) await expect(tick(page, unwatched)).toBeVisible();
  });

  test("a stroke and its bar are not the only way: a tap still marks one episode", async ({
    page,
  }) => {
    await page.goto(`/titles/${painted.libraryEntryId}`);
    await tick(page, 2).click();

    await expect(tick(page, 2)).toHaveCount(0);
    await expect(page.locator("[data-paint-stroke]")).toHaveCount(0);
  });
});
