import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #472, handoff §11.2 (spec #428): the *Watched. Undo* toast arrives and leaves
 * instead of blinking. `tests/motion-moments.test.ts` holds the stylesheet's own
 * `action-toast-transition` rule — the durations, the `@starting-style` entrance, the
 * reduced-motion fade; this plays the moment in a browser, the way
 * `tests/e2e/list-take-off.spec.ts` plays its own toast's exit and
 * `tests/e2e/title-count-roll.spec.ts` plays the count's roll on the very same title
 * page used here.
 *
 * `--dur-slow` and `--dur-fast` are stretched for the whole file, the way
 * `search-add-roll.spec.ts` stretches `--dur-roll`: the real 380ms/140ms are both well
 * under the ~400ms floor a `expect.poll` can reliably catch, and a per-frame recorder
 * armed before the moment starts (`list-take-off.spec.ts`'s own technique) is how the two
 * fades below are actually read.
 */

declare global {
  interface Window {
    __actionToastRecord?: Array<{
      readonly text: string;
      readonly samples: Array<{
        readonly t: number;
        readonly opacity: number;
        readonly transform: string;
      }>;
    }>;
  }
}

let show: SeededTitle;
let replaceShow: SeededTitle;
let reducedMotionShow: SeededTitle;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Three episodes, one watched: the main button offers episode 2, then episode 3 once
  // episode 2 is marked — each mark raises its own toast, which the "replaces while
  // leaving" test needs two distinct ones for. Each test marks for real, so each gets its
  // own seeded show rather than sharing one.
  show = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  replaceShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  reducedMotionShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "action-toast-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "action-toast-motion-session.json") });

// The main action button and the episode row's own mark control carry the same
// accessible name (`title-count-roll.spec.ts`'s own `markButton`) — `.first()` is the
// main button, which `TitleHero`'s `actions` renders before the episode list.
const markButton = (page: Page, episode: number, name: string) =>
  page
    .getByRole("main")
    .getByRole("button", {
      name: `Mark Season 1, Episode ${episode} — ${name} watched`,
      exact: true,
    })
    .first();

async function stretchDurations(page: Page): Promise<void> {
  await page.addStyleTag({ content: ":root { --dur-slow: 1200ms; --dur-fast: 500ms; }" });
}

/** Arms a per-frame recorder for every `.action-toast-transition` node that appears from
 *  this point on, each tagged by its own text so two toasts on screen at once (the
 *  "replaces while leaving" test) can be told apart afterwards — the same shape
 *  `hold-to-select-reduced-motion.spec.ts`'s `armHoldRecorder` arms on a node caught by a
 *  `MutationObserver` rather than polled for. */
async function armActionToastRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record: NonNullable<typeof window.__actionToastRecord> = [];
    window.__actionToastRecord = record;
    const seen = new WeakSet<Element>();

    function track(element: Element): void {
      if (seen.has(element)) return;
      seen.add(element);
      const entry = {
        text: element.textContent ?? "",
        samples: [] as { t: number; opacity: number; transform: string }[],
      };
      record.push(entry);
      const stopAt = performance.now() + 2_000;
      const tick = () => {
        const style = getComputedStyle(element);
        entry.samples.push({
          t: performance.now(),
          opacity: Number(style.opacity),
          transform: style.transform,
        });
        if (element.isConnected && performance.now() < stopAt) requestAnimationFrame(tick);
      };
      tick();
    }

    for (const element of document.querySelectorAll(".action-toast-transition")) track(element);
    const observer = new MutationObserver(() => {
      for (const element of document.querySelectorAll(".action-toast-transition")) track(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function readActionToastRecord(
  page: Page,
): Promise<NonNullable<Window["__actionToastRecord"]>> {
  return page.evaluate(() => window.__actionToastRecord ?? []);
}

/** `getComputedStyle(...).transitionDuration` answers one value per listed transition
 *  property (`opacity`, `transform`), comma-separated even when, as here, both share one
 *  token — so this checks every value in the list rather than the whole string. */
async function transitionDurations(toast: Locator): Promise<string[]> {
  const raw = await toast.evaluate((element) => getComputedStyle(element).transitionDuration);
  return raw.split(",").map((value) => value.trim());
}

test("the toast enters from 8px above with a fade on --dur-slow, Undo still works, and it leaves upward on --dur-fast", async ({
  page,
}) => {
  await page.goto(`/titles/${show.libraryEntryId}`);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1, name: show.titleName }),
  ).toBeVisible();
  await stretchDurations(page);
  await armActionToastRecorder(page);

  await markButton(page, 2, "Fixture Episode 2").click();

  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Watched.");
  expect(await toast.getAttribute("data-leaving")).toBeNull();

  const entranceDurations = await transitionDurations(toast);
  expect(entranceDurations.every((value) => value === "1.2s")).toBe(true);

  // The recorder's very first frame already shows the `@starting-style` snapshot — faded
  // and displaced — and by the time the stretched entrance is done it has reached full
  // opacity with no transform left at all.
  await page.waitForTimeout(1_300);
  const [record] = await readActionToastRecord(page);
  expect(record.samples.length).toBeGreaterThan(2);
  expect(record.samples[0].opacity).toBeLessThan(0.9);
  expect(record.samples[0].transform).not.toBe("none");
  const settled = record.samples[record.samples.length - 1];
  expect(settled.opacity).toBe(1);
  expect(settled.transform).toBe("none");

  // Undo still presses and still works while the toast is on screen.
  const undo = toast.getByRole("button", { name: "Undo", exact: true });
  await undo.click();

  await expect.poll(() => toast.getAttribute("data-leaving")).toBe("true");
  const exitDurations = await transitionDurations(toast);
  expect(exitDurations.every((value) => value === "0.5s")).toBe(true);

  // Gone once the exit has actually run its course — not before.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 2_000 });

  // Undo's own effect: episode 2 reads unwatched again, so the main button still offers it.
  await expect(markButton(page, 2, "Fixture Episode 2")).toBeVisible();
});

test("marking again while one is leaving shows the new toast arriving in the same place while the old one finishes leaving — never two resting toasts", async ({
  page,
}) => {
  await page.goto(`/titles/${replaceShow.libraryEntryId}`);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1, name: replaceShow.titleName }),
  ).toBeVisible();
  await stretchDurations(page);

  await markButton(page, 2, "Fixture Episode 2").click();
  const toasts = page.locator(".action-toast-transition");
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toContainText("Season 1, Episode 2");

  // Mark again well before the first offer's own six-second life — or even its (stretched)
  // entrance — has run its course. `action-toast.ts`'s `raiseAction` replaces the store's
  // one offer unconditionally, with no `null` in between, which is exactly the moment the
  // toast must not blink through rather than visibly hand off.
  await markButton(page, 3, "Fixture Episode 3").click();
  await expect(toasts).toHaveCount(2);

  const leaving = toasts.filter({ hasText: "Season 1, Episode 2" });
  const arriving = toasts.filter({ hasText: "Season 1, Episode 3" });
  await expect(leaving).toHaveCount(1);
  await expect(arriving).toHaveCount(1);
  expect(await leaving.getAttribute("data-leaving")).toBe("true");
  expect(await arriving.getAttribute("data-leaving")).toBeNull();

  // The same place: both sit in the same CSS grid cell rather than stacking one above
  // the other. `offsetTop`/`offsetLeft` read the box's layout position, excluding the
  // `transform` each is still mid-animation on — `getBoundingClientRect` would catch the
  // two at different points along that same shared path and report a mismatch that is
  // really just the two not being sampled at the exact same instant.
  const [leavingOffset, arrivingOffset] = await Promise.all([
    leaving.evaluate((element) => ({
      top: (element as HTMLElement).offsetTop,
      left: (element as HTMLElement).offsetLeft,
    })),
    arriving.evaluate((element) => ({
      top: (element as HTMLElement).offsetTop,
      left: (element as HTMLElement).offsetLeft,
    })),
  ]);
  expect(leavingOffset.top).toBe(arrivingOffset.top);
  expect(leavingOffset.left).toBe(arrivingOffset.left);

  // The leaving toast finishes its own exit and is gone; the new one is the only toast
  // left on screen — never two resting at once.
  await expect(toasts).toHaveCount(1, { timeout: 2_000 });
  await expect(toasts).toContainText("Season 1, Episode 3");
  await expect(toasts.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
});

test("under reduced motion both fades keep their durations and nothing moves", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/titles/${reducedMotionShow.libraryEntryId}`);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1, name: reducedMotionShow.titleName }),
  ).toBeVisible();
  await stretchDurations(page);
  await armActionToastRecorder(page);

  await markButton(page, 2, "Fixture Episode 2").click();
  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();

  const entranceDurations = await transitionDurations(toast);
  expect(entranceDurations.every((value) => value === "1.2s")).toBe(true);

  await page.waitForTimeout(1_300);
  const [record] = await readActionToastRecord(page);
  // A fade, never a cut: some mid-transition sample sits strictly between fully hidden
  // and fully shown.
  expect(record.samples.some((sample) => sample.opacity > 0.05 && sample.opacity < 0.95)).toBe(
    true,
  );
  // Nothing moves: transform reads "none" on every single recorded frame, start to finish.
  expect(record.samples.every((sample) => sample.transform === "none")).toBe(true);

  const undo = toast.getByRole("button", { name: "Undo", exact: true });
  await undo.click();

  await expect.poll(() => toast.getAttribute("data-leaving")).toBe("true");
  const exitDurations = await transitionDurations(toast);
  expect(exitDurations.every((value) => value === "0.5s")).toBe(true);

  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 2_000 });
});
