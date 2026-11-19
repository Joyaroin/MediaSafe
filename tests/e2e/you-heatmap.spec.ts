import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedDayOfWatches } from "./support/fixture-day";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #372 in a real browser: the year grid is on You, opens on the latest watched day,
 * is usable by keyboard, and fits a phone without scrolling the page sideways. Its own
 * account (the fixture user's zone is UTC); `seedWatchingShow` marks the pilot now.
 */

let show: SeededTitle;

const dayInWords = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "you-heatmap-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "you-heatmap-session.json") });

test("opens on today's watch, and arrow keys move a day and a week", async ({ page }) => {
  await page.goto("/you");
  await expect(page.getByRole("heading", { name: "A year of watching" })).toBeVisible();

  const today = new Date();
  const todayCell = page.getByRole("button", { name: `1 watch on ${dayInWords(today)}` });
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(show.titleName, { exact: false }).last()).toBeVisible();

  await todayCell.focus();
  await page.keyboard.press("ArrowLeft");

  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const weekAgoCell = page.getByRole("button", { name: `No watches on ${dayInWords(weekAgo)}` });
  await expect(weekAgoCell).toBeFocused();
  await expect(weekAgoCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`Nothing watched on ${dayInWords(weekAgo)}`)).toBeVisible();

  await page.keyboard.press("End");
  await expect(todayCell).toBeFocused();
});

test("fits a phone, scrolling inside its own box, opened on today", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/you");
  const todayCell = page.getByRole("button", { name: `1 watch on ${dayInWords(new Date())}` });
  // Bring the section into view vertically only; the grid's own horizontal scroll is the
  // thing under test, so nothing here may scroll it.
  await page.getByRole("heading", { name: "A year of watching" }).evaluate((heading) =>
    window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 100),
  );
  await expect(todayCell).toBeInViewport();

  if (process.env.YOU_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.YOU_SCREENSHOT_DIR}/heatmap-phone.png`, fullPage: true });
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("a day grouped by title", () => {
  const token = Math.random().toString(36).slice(2, 8);
  const name = (letter: string) => `Day ${token} ${letter}`;
  // Six titles; the one with the most episodes is third by recency, so an order by count
  // (the design still's) would fail here. Newest first: A, B, C, D, E, F.
  const day = [
    { titleName: name("A"), episodes: [[1, 1]], secondsAgo: 10 },
    { titleName: name("B"), episodes: [[1, 1]], secondsAgo: 20 },
    { titleName: name("C"), episodes: [[2, 1], [1, 2], [1, 1]], secondsAgo: 30 },
    { titleName: name("D"), episodes: [[1, 1]], secondsAgo: 40 },
    { titleName: name("E"), episodes: [[1, 1]], secondsAgo: 50 },
    { titleName: name("F"), episodes: [[1, 1]], secondsAgo: 60 },
  ] as const;

  test.use({ storageState: path.join(__dirname, ".auth", "you-heatmap-day-session.json") });

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    await seedDayOfWatches(session.userId, day);
    writeFileSync(
      path.join(__dirname, ".auth", "you-heatmap-day-session.json"),
      JSON.stringify(toStorageState(session), null, 2),
    );
  });

  test("shows five titles newest first, opens one by its button, and reveals the rest", async ({ page }) => {
    await page.goto("/you");
    await expect(page.getByRole("heading", { name: "A year of watching" })).toBeVisible();

    const rows = page.locator("button[aria-expanded]");
    await expect(rows).toHaveCount(5);
    const lines = (await rows.allInnerTexts()).map((line) => line.trim());
    expect(lines).toEqual([
      `${name("A")} · 1 episode · season 1`,
      `${name("B")} · 1 episode · season 1`,
      `${name("C")} · 3 episodes · seasons 1–2`,
      `${name("D")} · 1 episode · season 1`,
      `${name("E")} · 1 episode · season 1`,
    ]);

    // Named by its visible line, found by that name, closed, and its episodes unlisted.
    const group = page.getByRole("button", { name: `${name("C")} · 3 episodes · seasons 1–2` });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("S01 · E01 · Episode 1-1")).toHaveCount(0);

    await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "true");
    const episodes = page.locator(`#day-title-${await groupEntryId(group)} li`);
    await expect(episodes).toHaveText([
      "S01 · E01 · Episode 1-1",
      "S01 · E02 · Episode 1-2",
      "S02 · E01 · Episode 2-1",
    ]);

    await expect(page.getByRole("button", { name: name("F"), exact: false })).toHaveCount(0);
    if (process.env.YOU_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.YOU_SCREENSHOT_DIR}/day-open-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 375, height: 900 });
      await page.screenshot({ path: `${process.env.YOU_SCREENSHOT_DIR}/day-open-phone.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByRole("button", { name: "Show all 6 titles" }).click();
    await expect(rows).toHaveCount(6);
    await expect(page.getByRole("button", { name: `${name("F")} · 1 episode · season 1` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show all 6 titles" })).toHaveCount(0);
  });
});

async function groupEntryId(group: import("@playwright/test").Locator): Promise<string> {
  const controls = await group.getAttribute("aria-controls");
  return (controls ?? "").replace("day-title-", "");
}
