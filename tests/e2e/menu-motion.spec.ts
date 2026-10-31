import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedListWithTitles, seedWatchingShow, type SeededList, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #439 — *the …* menus grow from their button*. `tests/motion-moments.test.ts` holds
 * the static half: that `menu-transition` (`app/globals.css`) computes to the values the
 * ticket names. This is the one thing only a browser can show — the panel's own `transform`
 * actually moving from `scale(0.97)` toward identity when a reader opens it, rather than
 * the panel appearing whole on the same frame the `<details>` opens.
 *
 * ── Why a frame-by-frame recorder, not a poll ────────────────────────────────────────────
 *
 * The entrance is `--dur-fast`, 140ms — well under the ~400ms a `page.waitForFunction`/
 * `expect.poll` interval can reliably catch mid-flight (`up-next-motion.spec.ts`'s own
 * reasoning, restated in `action-toast-motion.spec.ts` for the same reason). A
 * `requestAnimationFrame` loop started in the page before the panel exists, finding it by
 * its class and sampling its computed `transform` every frame, is the one way to be sure a
 * transitional frame was actually seen rather than missed between polls.
 */

let show: SeededTitle;
let list: SeededList;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedWatchingShow(session.userId);
  list = await seedListWithTitles(session.userId, 1);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "menu-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "menu-motion-session.json") });

interface Sample {
  readonly transform: string;
  readonly opacity: string;
}

/**
 * Arms a `requestAnimationFrame` recorder in the page, before the menu's `<details>` is
 * opened. It finds `.menu-transition` lazily — the class is each menu's own panel, so the
 * same recorder serves both the title page's `MoreMenu` and a list's `ListMenu` without
 * telling them apart. It samples every frame and stops once it has enough of them; the
 * panel itself is never removed the way the toast is, so there is no node-removal to stop
 * on instead.
 */
async function recordMenuMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    (window as unknown as { __menuSamples: Sample[] }).__menuSamples = samples;
    let frame = 0;
    const MAX_FRAMES = 60; // well past --dur-fast (140ms) at any refresh rate this runs at

    function tick() {
      const el = document.querySelector(".menu-transition");
      if (el) {
        const style = getComputedStyle(el);
        samples.push({ transform: style.transform, opacity: style.opacity });
      }
      frame += 1;
      if (frame < MAX_FRAMES) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });
}

async function readSamples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __menuSamples: Sample[] }).__menuSamples);
}

/** Waits out the recorder's own `MAX_FRAMES` budget — comfortably past the entrance's
 *  `--dur-fast` (140ms) so the last samples read the panel at rest. */
async function waitForRecording(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}

test("the title page's *…* menu panel grows from scale(0.97) toward identity", async ({
  page,
}) => {
  await page.goto(`/titles/${show.libraryEntryId}`);
  await recordMenuMotion(page);

  await page.getByRole("main").getByLabel("More actions").click();
  await expect(page.getByRole("main").getByRole("link", { name: /Remove .* from your library/ })).toBeVisible();

  await waitForRecording(page);
  const samples = await readSamples(page);

  expect(samples.length).toBeGreaterThan(0);
  // The entrance was actually seen moving and fading, not just present and settled — some
  // frame reads a real transform (not the resting "none") together with a partial opacity.
  expect(samples.some((sample) => sample.transform !== "none" && Number(sample.opacity) < 1)).toBe(
    true,
  );
  // It did settle: the last frames recorded read the panel at rest.
  expect(samples.at(-1)?.transform).toBe("none");
  expect(Number(samples.at(-1)?.opacity)).toBe(1);
});

test("a list's Rename / Delete menu panel grows from scale(0.97) toward identity", async ({
  page,
}) => {
  await page.goto(`/lists/${list.listId}`);
  await recordMenuMotion(page);

  await page.getByRole("main").getByLabel(`More for ${list.listName}`).click();
  await expect(page.getByRole("main").getByRole("button", { name: "Rename", exact: true })).toBeVisible();

  await waitForRecording(page);
  const samples = await readSamples(page);

  expect(samples.length).toBeGreaterThan(0);
  expect(samples.some((sample) => sample.transform !== "none" && Number(sample.opacity) < 1)).toBe(
    true,
  );
  expect(samples.at(-1)?.transform).toBe("none");
  expect(Number(samples.at(-1)?.opacity)).toBe(1);
});
