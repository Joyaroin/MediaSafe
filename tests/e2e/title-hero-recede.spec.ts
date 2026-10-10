import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #369 in a real browser: the title page hero shrinks and fades as the page scrolls,
 * from CSS scroll timelines alone, and stays static under reduced motion.
 *
 * Read off computed style rather than a screenshot: a scroll-driven animation's progress
 * is the scroll position, so the transform at a given scroll is a fact the browser
 * reports, and the reduced-motion case is the same fact being `none`.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-hero-recede-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-hero-recede-session.json") });

test.beforeEach(async ({ page }) => {
  // Short, so the page has well over the 280px of scroll the animation runs across.
  await page.setViewportSize({ width: 500, height: 360 });
});

/** The poster wrapper's and the band's computed transform and opacity at `scrollY`. */
async function heroAt(page: Page, scrollY: number) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return page.evaluate(() => {
    const read = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector)!);
      return { transform: style.transform, opacity: Number(style.opacity) };
    };
    return { poster: read(".hero-recede-poster"), band: read(".hero-recede-band") };
  });
}

const IDENTITY = ["none", "matrix(1, 0, 0, 1, 0, 0)"];

test("the hero shrinks and fades as the page scrolls, and is whole at the top", async ({
  page,
}) => {
  await page.goto(`/titles/${show.libraryEntryId}`);
  await expect(page.getByRole("heading", { level: 1, name: show.titleName })).toBeVisible();

  const top = await heroAt(page, 0);
  expect(IDENTITY).toContain(top.poster.transform);
  expect(top.poster.opacity).toBe(1);

  const scrolled = await heroAt(page, 280);
  expect(IDENTITY).not.toContain(scrolled.poster.transform);
  expect(scrolled.poster.opacity).toBeLessThan(1);
  expect(scrolled.band.opacity).toBeLessThan(0.1);

  // Back to the top restores it — the timeline is the scroll position, not a one-way trip.
  const back = await heroAt(page, 0);
  expect(IDENTITY).toContain(back.poster.transform);
});

test("under reduced motion the hero stays static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/titles/${show.libraryEntryId}`);
  await expect(page.getByRole("heading", { level: 1, name: show.titleName })).toBeVisible();

  const scrolled = await heroAt(page, 280);
  expect(IDENTITY).toContain(scrolled.poster.transform);
  expect(scrolled.poster.opacity).toBe(1);
  expect(scrolled.band.opacity).toBe(1);
});
