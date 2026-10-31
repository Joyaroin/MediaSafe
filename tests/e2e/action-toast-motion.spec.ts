import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #438 — the *Watched. Undo* toast arrives and leaves instead of blinking.
 *
 * `tests/action-toast.test.ts` holds the static half: that `action-toast-transition`
 * (`app/globals.css`) computes to the values the ticket names, mirroring
 * `write-failure-toast-transition`. This is the one thing only a browser can show — the
 * toast's own `transform`/`opacity` actually changing partway through its entrance, and
 * again partway through its exit, rather than the two states appearing and disappearing on
 * the same frame.
 *
 * ── Why a frame-by-frame recorder, not a poll ────────────────────────────────────────────
 *
 * Both transitions are short — `--dur-slow` (380ms) in, `--dur-fast` (140ms) out — well
 * under the ~400ms a `page.waitForFunction`/`expect.poll` interval can reliably catch
 * mid-flight. A `requestAnimationFrame` loop started in the page *before* the toast exists,
 * recording every frame's computed style once the node appears, is the one way to be sure a
 * transitional frame was actually seen rather than missed between polls.
 */

let toastShow: SeededTitle;
let reducedMotionShow: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  toastShow = await seedShowWithSeason(session.userId, { episodes: 1, watched: [] });
  // Its own title, rather than reusing `toastShow` — the two tests then carry no ordering
  // dependency on each other's Undo actually reversing the first mark.
  reducedMotionShow = await seedShowWithSeason(session.userId, { episodes: 1, watched: [] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "action-toast-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "action-toast-motion-session.json") });

interface Sample {
  readonly t: number;
  readonly opacity: string;
  readonly transform: string;
  readonly leaving: string | null;
}

/**
 * Arms a `requestAnimationFrame` recorder in the page, before the toast exists. It finds
 * `.action-toast-transition` once the mark raises it — the class, not a bare
 * `[role="status"]`: the title page already carries other `role="status"` live regions
 * (`pending-line.tsx`'s route-pending indicator among them) that stay in the DOM whether
 * or not they are currently showing anything, and a raw attribute selector finds whichever
 * of them is first rather than the toast. The class is this toast's own. It samples the
 * found element's computed style every frame and stops on its own once the node is gone —
 * the exit's own `onTransitionEnd`/`settle` has removed it.
 */
async function recordToastMotion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    (window as unknown as { __toastSamples: Sample[] }).__toastSamples = samples;
    let el: Element | null = null;
    let frame = 0;
    const MAX_FRAMES = 600; // a bounded safety net; the real stop is the node's removal

    function tick() {
      if (!el) el = document.querySelector(".action-toast-transition");
      if (el) {
        if (!document.body.contains(el)) return;
        const style = getComputedStyle(el);
        samples.push({
          t: performance.now(),
          opacity: style.opacity,
          transform: style.transform,
          leaving: el.getAttribute("data-leaving"),
        });
      }
      frame += 1;
      if (frame < MAX_FRAMES) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });
}

async function readSamples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __toastSamples: Sample[] }).__toastSamples);
}

test("the toast's transform and opacity change on arrival, and again as it leaves", async ({
  page,
}) => {
  await page.goto(`/titles/${toastShow.libraryEntryId}`);
  await recordToastMotion(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Mark Season 1, Episode 1 — Fixture Episode 1 watched" })
    .first()
    .click();

  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Watched.");

  // Give the entrance's own duration (--dur-slow, 380ms) time to land before moving on,
  // so the sampler has crossed from the starting style into the resting one.
  await expect
    .poll(() => toast.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toHaveCount(0);

  const samples = await readSamples(page);
  expect(samples.length).toBeGreaterThan(0);

  const arriving = samples.filter((sample) => sample.leaving !== "true");
  const leaving = samples.filter((sample) => sample.leaving === "true");

  // The entrance was actually seen moving and fading, not just present and then settled —
  // some frame mid-arrival reads a real transform (translateY(-8px), not "none") together
  // with a partial opacity.
  expect(
    arriving.some((sample) => sample.transform !== "none" && Number(sample.opacity) < 1),
  ).toBe(true);
  // It did land: the last frame before Undo was pressed is resting.
  expect(arriving.at(-1)?.transform).toBe("none");
  expect(Number(arriving.at(-1)?.opacity)).toBe(1);

  // The exit was seen moving and fading too, under `data-leaving="true"`, before the node
  // was actually removed.
  expect(leaving.length).toBeGreaterThan(0);
  expect(
    leaving.some((sample) => sample.transform !== "none" && Number(sample.opacity) < 1),
  ).toBe(true);
});

test.describe("under reduced motion", () => {
  test("the toast still fades in and out, without moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/titles/${reducedMotionShow.libraryEntryId}`);
    await recordToastMotion(page);

    await page
      .getByRole("main")
      .getByRole("button", { name: "Mark Season 1, Episode 1 — Fixture Episode 1 watched" })
      .first()
      .click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((element) => getComputedStyle(element).transform)).toBe("none");

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast).toHaveCount(0);

    const samples = await readSamples(page);
    // No frame, arriving or leaving, ever carries a real transform under reduced motion —
    // the travel drops — but the opacity still moves away from 1 at some point, which is
    // the fade reduced motion keeps.
    expect(samples.every((sample) => sample.transform === "none")).toBe(true);
    expect(samples.some((sample) => Number(sample.opacity) < 1)).toBe(true);
  });
});
