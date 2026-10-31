import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedListOfFilms } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #476, handoff §11.2's *A title taken off a list*: the row or cell fades on
 * `--dur-fast` while the rows or grid close up behind it on `smooth` — `AnimatePresence`
 * in `popLayout`, the way Tonight's rows already leave (`up-next-motion.spec.ts`'s own
 * "a row's tick pops ... a finished row leaves ... while the rows above stay still" is
 * this spec's direct prior art, including its technique: a continuous in-page recorder
 * rather than a poll, since the moment under test is well under 400ms).
 *
 * Three lists, one fixture account, serial: each test takes its own list's titles down
 * by one and leaves the list where the next test expects it.
 */

let listViewListId: string;
let listViewName: string;
let iconViewListId: string;

const LIST_VIEW_TITLES = [
  "Alpha E2E Take-Off Film",
  "Bravo E2E Take-Off Film",
  "Charlie E2E Take-Off Film",
  "Delta E2E Take-Off Film",
] as const;
const ICON_VIEW_TITLES = [
  "Echo E2E Take-Off Film",
  "Foxtrot E2E Take-Off Film",
  "Golf E2E Take-Off Film",
] as const;
const REDUCED_MOTION_TITLES = [
  "Hotel E2E Take-Off Film",
  "India E2E Take-Off Film",
  "Juliet E2E Take-Off Film",
] as const;

let reducedMotionListId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const session = await seedFixtureSession();

  const listView = await seedListOfFilms(session.userId, LIST_VIEW_TITLES);
  listViewListId = listView.listId;
  listViewName = listView.listName;

  iconViewListId = (await seedListOfFilms(session.userId, ICON_VIEW_TITLES)).listId;
  reducedMotionListId = (await seedListOfFilms(session.userId, REDUCED_MOTION_TITLES)).listId;

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "list-take-off-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "list-take-off-session.json") });

/** The row or cell naming `name`, however the list is drawn — a row's `<li>` and an
 *  icon cell's `<li>` are both found the same way. */
const itemFor = (page: Page, name: string) =>
  page.getByRole("main").locator("li", { hasText: name });

const takeOffButton = (item: Locator, name: string) =>
  item.getByRole("button", { name: `Take ${name} off this list`, exact: true });

/** Starts an in-page recorder on `element` that never stops watching once armed: whether
 *  its `transform` is ever anything but `none` (a row or cell that did not change must
 *  never animate), how many milliseconds after arming its edge first moved by more than a
 *  pixel in either axis (closing up the gap a taken-off item leaves — a row closes
 *  vertically, a grid cell can close sideways within its row too), and a running trail of
 *  `{ t, top, left }` samples so the test can tell *started moving* apart from *arrived* —
 *  all written to `window[flag]` so the test can read them back once the gesture is done.
 *  A continuous recorder rather than a poll, because the window this proves anything in is
 *  under the exit's own 140ms (`--dur-fast`) — too short to catch by sampling at an
 *  interval.
 */
async function armRecorder(target: Locator, flag: string): Promise<void> {
  await target.evaluate((element, flagName) => {
    const win = window as unknown as Record<
      string,
      {
        startedAt: number;
        movedAfterMs: number | null;
        everMoved: boolean;
        samples: { t: number; top: number; left: number }[];
      }
    >;
    const start = element.getBoundingClientRect();
    win[flagName] = {
      startedAt: performance.now(),
      movedAfterMs: null,
      everMoved: false,
      samples: [],
    };
    const tick = () => {
      const record = win[flagName];
      if (!record) return;
      if (getComputedStyle(element).transform !== "none") record.everMoved = true;
      const now = element.getBoundingClientRect();
      const t = performance.now() - record.startedAt;
      record.samples.push({ t, top: now.top, left: now.left });
      if (
        record.movedAfterMs === null &&
        (Math.abs(now.top - start.top) > 1 || Math.abs(now.left - start.left) > 1)
      ) {
        record.movedAfterMs = t;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, flag);
}

async function readRecorder(
  page: Page,
  flag: string,
): Promise<{
  readonly movedAfterMs: number | null;
  readonly everMoved: boolean;
  readonly samples: ReadonlyArray<{ readonly t: number; readonly top: number; readonly left: number }>;
}> {
  return page.evaluate((flagName) => {
    const win = window as unknown as Record<
      string,
      {
        movedAfterMs: number | null;
        everMoved: boolean;
        samples: { t: number; top: number; left: number }[];
      }
    >;
    const record = win[flagName];
    return {
      movedAfterMs: record?.movedAfterMs ?? null,
      everMoved: record?.everMoved ?? false,
      samples: record?.samples ?? [],
    };
  }, flag);
}

/** The time of the last recorded sample that still differs from where the element ends up
 *  — *has settled*, not *has started moving*. A row riding `smooth`'s full 300ms spring
 *  also moves within the first frame, so `movedAfterMs` alone cannot distinguish that from
 *  reduced motion's "arrives at once"; this can, because the spring keeps nudging the row
 *  for most of those 300ms while an immediate arrival stops after a frame or two.
 */
function settledAfterMs(
  samples: ReadonlyArray<{ readonly t: number; readonly top: number; readonly left: number }>,
): number {
  if (samples.length === 0) return 0;
  const final = samples[samples.length - 1];
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i];
    if (Math.abs(sample.top - final.top) > 1 || Math.abs(sample.left - final.left) > 1) {
      return (samples[i + 1] ?? sample).t;
    }
  }
  return samples[0].t;
}

/** Starts an in-page recorder of `element`'s computed opacity, one sample per frame, until
 *  the element leaves the document — which is when `AnimatePresence` finishes popping it
 *  out, so the trail it leaves behind in `window[flag]` is the whole of its exit fade. */
async function armOpacityRecorder(target: Locator, flag: string): Promise<void> {
  await target.evaluate((element, flagName) => {
    const win = window as unknown as Record<string, number[]>;
    const samples: number[] = [];
    win[flagName] = samples;
    const tick = () => {
      if (!element.isConnected) return;
      samples.push(Number(getComputedStyle(element).opacity));
      requestAnimationFrame(tick);
    };
    tick();
  }, flag);
}

async function readOpacitySamples(page: Page, flag: string): Promise<readonly number[]> {
  return page.evaluate((flagName) => (window as unknown as Record<string, number[]>)[flagName] ?? [], flag);
}

test("a taken-off row fades out on the exit timing and the rows below close up on smooth, giving up its space at once — rows that did not change never animate", async ({
  page,
}) => {
  await page.goto(`/lists/${listViewListId}`);
  // Icons is the default view; this test is the row view's.
  await page.getByRole("main").getByRole("button", { name: "List", exact: true }).click();

  const [alpha, bravo, charlie] = LIST_VIEW_TITLES;
  await expect(itemFor(page, bravo)).toBeVisible();

  await armRecorder(itemFor(page, alpha), "aboveRecord");
  await armRecorder(itemFor(page, charlie), "belowRecord");

  await takeOffButton(itemFor(page, bravo), bravo).click();

  // The row leaves; the toast it leaves behind names this list and offers Undo.
  await expect(itemFor(page, bravo)).toHaveCount(0);
  const toast = page.getByRole("status");
  await expect(toast).toContainText(`Taken off ${listViewName}.`);
  const undo = toast.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeVisible();

  const below = await readRecorder(page, "belowRecord");
  // Closing up starts at once — well inside the 140ms exit (`--dur-fast`), not after it.
  expect(below.movedAfterMs).not.toBeNull();
  expect(below.movedAfterMs as number).toBeLessThan(120);

  const above = await readRecorder(page, "aboveRecord");
  expect(above.everMoved).toBe(false);

  // Undo puts it back, proving the write underneath is untouched — `take-off.ts` is not
  // this ticket's to change.
  await undo.click();
  await expect(itemFor(page, bravo)).toBeVisible();
});

test("the same holds for a cell in the Icons grid", async ({ page }) => {
  await page.goto(`/lists/${iconViewListId}`);
  // Icons is the default view; nothing to switch.

  const [echo, foxtrot, golf] = ICON_VIEW_TITLES;
  await expect(itemFor(page, foxtrot)).toBeVisible();

  await armRecorder(itemFor(page, echo), "aboveCellRecord");
  await armRecorder(itemFor(page, golf), "belowCellRecord");

  await takeOffButton(itemFor(page, foxtrot), foxtrot).click();

  await expect(itemFor(page, foxtrot)).toHaveCount(0);

  const below = await readRecorder(page, "belowCellRecord");
  expect(below.movedAfterMs).not.toBeNull();
  expect(below.movedAfterMs as number).toBeLessThan(120);

  const above = await readRecorder(page, "aboveCellRecord");
  expect(above.everMoved).toBe(false);
});

test.describe("under reduced motion", () => {
  test("it fades out and the rest take their places at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/lists/${reducedMotionListId}`);
    await page.getByRole("main").getByRole("button", { name: "List", exact: true }).click();

    const [hotel, india] = REDUCED_MOTION_TITLES;
    await expect(itemFor(page, india)).toBeVisible();

    await armRecorder(itemFor(page, india), "reducedBelowRecord");
    await armOpacityRecorder(itemFor(page, hotel), "reducedFadeRecord");

    await takeOffButton(itemFor(page, hotel), hotel).click();

    await expect(itemFor(page, hotel)).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Taken off");

    // Give `smooth`'s own 300ms a chance to finish riding out, so a regression that drops
    // reduced motion (and lets the row ease into place on the spring instead of arriving
    // at once) shows up in the recorded trail rather than being missed by reading too soon.
    await page.waitForTimeout(350);

    // "At once": the row below reaches its final offset within a frame or two of the
    // click, not merely *starts* moving within that window — a row riding `smooth`'s full
    // spring also starts moving in the first frame, so settling is what distinguishes it.
    const below = await readRecorder(page, "reducedBelowRecord");
    expect(below.movedAfterMs).not.toBeNull();
    expect(settledAfterMs(below.samples)).toBeLessThan(80);

    // It still fades out: reduced motion drops the movement, not the exit itself, so the
    // leaving row's opacity must pass through a visible mid-value rather than cut straight
    // from 1 to 0.
    const fade = await readOpacitySamples(page, "reducedFadeRecord");
    expect(fade.some((opacity) => opacity > 0.05 && opacity < 0.95)).toBe(true);
  });
});
