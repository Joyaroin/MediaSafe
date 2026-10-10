import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

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
