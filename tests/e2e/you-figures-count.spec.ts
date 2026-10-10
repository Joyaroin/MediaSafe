import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedWatchingShow } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #368 in a real browser: You's counts run up from zero when the page arrives, end
 * on exactly the figure the server rendered, never show a figure going backwards, and do
 * no counting at all under reduced motion.
 *
 * Its own account, for `up-next-restart.spec.ts`'s reason: the shared one stays empty, and
 * an empty library renders You's sentence rather than its figures. Three shows with one
 * watched episode each makes *Episodes watched* `3`.
 *
 * The record is a `MutationObserver` installed before the document exists, so every value
 * the *Episodes watched* figure ever holds in the visible page is in it — a frame sampler
 * would miss a value that lasted less than a frame.
 */

declare global {
  interface Window {
    __episodesSeen?: string[];
    __episodesHeard?: string[];
  }
}

const EPISODES = "3";

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  for (let i = 0; i < 3; i += 1) await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "you-figures-count-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "you-figures-count-session.json") });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__episodesSeen = [];
    window.__episodesHeard = [];

    function record() {
      for (const term of document.querySelectorAll("dt")) {
        // A streamed boundary waits in a `hidden` container before it is revealed; only
        // what the reader can see counts as seen.
        if (term.textContent !== "Episodes watched" || term.closest("[hidden]")) continue;
        const figure = term.nextElementSibling;
        const seen = figure?.querySelector('[aria-hidden="true"]')?.textContent ?? "";
        const heard = figure?.querySelector(".sr-only")?.textContent ?? "";
        if (window.__episodesSeen!.at(-1) !== seen) window.__episodesSeen!.push(seen);
        if (window.__episodesHeard!.at(-1) !== heard) window.__episodesHeard!.push(heard);
      }
    }

    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
});

async function arriveAtYouByNavigation(page: Page): Promise<void> {
  await page.goto("/library");
  await page.locator('a[href="/you"]:visible').first().click();
  await page.waitForURL("**/you");
  await expect(page.getByRole("main").locator("dt", { hasText: "Episodes watched" })).toBeVisible();
  await page.waitForTimeout(1000);
}

const seenOf = (page: Page) => page.evaluate(() => window.__episodesSeen ?? []);
const heardOf = (page: Page) => page.evaluate(() => window.__episodesHeard ?? []);

/** Every value the reader saw, as numbers, never decreasing — no snap back to zero. */
function neverGoesBackwards(seen: readonly string[]): boolean {
  return seen.every((value, index) => index === 0 || Number(value) >= Number(seen[index - 1]));
}

test("the counts run up from zero on arrival and land on the server's figure", async ({ page }) => {
  await arriveAtYouByNavigation(page);

  const seen = await seenOf(page);
  expect(seen[0]).toBe("0");
  expect(seen.length).toBeGreaterThan(2);
  expect(seen.at(-1)).toBe(EPISODES);
  expect(neverGoesBackwards(seen)).toBe(true);
  // Screen readers only ever have the final value.
  expect(await heardOf(page)).toEqual([EPISODES]);
});

test("a hard load never shows a figure going backwards", async ({ page }) => {
  // Whether the server's markup is hydrated (nothing counts — the reader has already seen
  // the figure) or its boundary is rendered on the client (the count runs, as on any
  // arrival), the figure must never drop from its value back to zero in front of the
  // reader.
  await page.goto("/you");
  await expect(page.getByRole("main").locator("dt", { hasText: "Episodes watched" })).toBeVisible();
  await page.waitForTimeout(1000);

  const seen = await seenOf(page);
  expect(seen.at(-1)).toBe(EPISODES);
  expect(neverGoesBackwards(seen)).toBe(true);
  expect(await heardOf(page)).toEqual([EPISODES]);
});

test.describe("under reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the final values appear at once, with no counting", async ({ page }) => {
    await arriveAtYouByNavigation(page);

    expect(await seenOf(page)).toEqual([EPISODES]);
    // And the watch times are not faded in either.
    await expect(page.locator("dd span[style*='opacity']")).toHaveCount(0);
  });
});
