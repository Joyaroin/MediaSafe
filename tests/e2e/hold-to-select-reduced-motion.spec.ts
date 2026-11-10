import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { HOLD_MS } from "@/app/(signed-in)/library/use-hold-to-select";
import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #470, in a real browser: under reduced motion, holding a Library cell to select it
 * fades the cell to about 70% opacity across the hold — `--hold-shown`, the exact `HOLD_MS`
 * the gesture itself times out on, handed to the stylesheet from `selectable-entry.tsx`
 * rather than retyped there — instead of showing nothing while the reader waits to find out
 * how long to keep holding. The landing itself still does not move, and the check badge
 * that confirms the hold worked fades in on `--dur-base` rather than popping.
 *
 * `tests/press-spring.test.ts` already proves the stylesheet declares all of this as text;
 * this proves a real browser plays it, in the right order, over the right span, on the one
 * surface where the duration is never a literal it could have mistyped.
 *
 * ── Recorded, not polled ───────────────────────────────────────────────────────────────
 * The fade's visible dip and the badge's arrival both live inside spans well under the
 * ~400ms an `expect.poll` could reliably catch, so both are watched by a per-frame
 * recorder armed before the gesture starts — the same shape `list-take-off.spec.ts` uses
 * for its own sub-`--dur-fast` exit fade.
 */

declare global {
  interface Window {
    __holdDim?: {
      cellOpacity: number[];
      cellTransforms: string[];
      badgeOpacity: number[];
      badgeTransforms: string[];
    };
  }
}

let seeded: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  seeded = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "hold-to-select-reduced-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "hold-to-select-reduced-motion-session.json"),
});

test.beforeEach(async ({ page }) => {
  // The same phone width `selection-swap.spec.ts` standardises its own hold on — the grid
  // and the gesture are unchanged at other widths, but this keeps the two hold specs
  // directly comparable.
  await page.setViewportSize({ width: 500, height: 721 });
});

/**
 * Starts an in-page recorder on `cell`, armed before the hold begins: the cell's own
 * opacity and transform, one sample per frame, for long enough to span the whole hold and
 * its landing; and — from the moment `selection-check-badge.tsx` mounts the check badge
 * inside it, caught by a `MutationObserver` rather than polled for — the badge's opacity
 * and transform for the length of its own arrival.
 */
async function armHoldRecorder(cell: Locator): Promise<void> {
  await cell.evaluate((element) => {
    const record = {
      cellOpacity: [] as number[],
      cellTransforms: [] as string[],
      badgeOpacity: [] as number[],
      badgeTransforms: [] as string[],
    };
    window.__holdDim = record;

    const cellStopAt = performance.now() + 1500;
    const tickCell = () => {
      record.cellOpacity.push(Number(getComputedStyle(element).opacity));
      record.cellTransforms.push(getComputedStyle(element).transform);
      if (performance.now() < cellStopAt) requestAnimationFrame(tickCell);
    };
    tickCell();

    let badgeArmed = false;
    const observer = new MutationObserver(() => {
      if (badgeArmed) return;
      const badge = element.querySelector(".badge-arrive");
      if (!badge) return;
      badgeArmed = true;

      const badgeStopAt = performance.now() + 500;
      const tickBadge = () => {
        record.badgeOpacity.push(Number(getComputedStyle(badge).opacity));
        record.badgeTransforms.push(getComputedStyle(badge).transform);
        if (performance.now() < badgeStopAt) requestAnimationFrame(tickBadge);
      };
      tickBadge();
    });
    observer.observe(element, { childList: true, subtree: true });
  });
}

async function readHoldRecorder(page: Page) {
  return page.evaluate(
    () =>
      window.__holdDim ?? {
        cellOpacity: [],
        cellTransforms: [],
        badgeOpacity: [],
        badgeTransforms: [],
      },
  );
}

test("under reduced motion the held cell dims instead of showing nothing, and lands without moving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/library");

  const cell = page.getByRole("main").getByRole("button", { name: new RegExp(seeded.titleName) });
  await expect(cell).toBeVisible();
  // The hold is recognised by a pointer handler `selectable-entry.tsx` only attaches once
  // hydrated — `selection-swap.spec.ts` names the identical race and the identical fix.
  await page.waitForLoadState("networkidle");

  await armHoldRecorder(cell);

  // A held press, not a click: the gesture lands on the finger staying down for `HOLD_MS`,
  // not on release, so the wait happens between `down` and `up`, and the mouse never moves
  // once it is down (well inside `HOLD_SLOP_PX`).
  const box = await cell.boundingBox();
  expect(box, `no bounding box for the seeded cell "${seeded.titleName}"`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS + 150);
  await page.mouse.up();

  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();
  // Past the badge's own `--dur-base` arrival, so its recorded trail is the whole of it.
  await page.waitForTimeout(400);

  const recorded = await readHoldRecorder(page);

  // The cell never compresses under reduced motion — only its opacity moves.
  expect(recorded.cellTransforms.every((value) => value === "none")).toBe(true);

  // And it visibly dims across the hold, to about 70% — neither staying fully opaque (no
  // cue at all for how long to keep holding) nor disappearing (the old `transition: none`
  // cut, mistaken for silence).
  const dimmedPoint = Math.min(...recorded.cellOpacity);
  expect(dimmedPoint).toBeGreaterThan(0.55);
  expect(dimmedPoint).toBeLessThan(0.85);

  // The check badge — the only confirmation iOS Safari's missing Vibration API leaves —
  // still arrives: it fades in rather than popping, and it does land fully opaque.
  expect(recorded.badgeOpacity.length).toBeGreaterThan(0);
  expect(recorded.badgeTransforms.every((value) => value === "none")).toBe(true);
  expect(recorded.badgeOpacity[0]).toBeLessThan(0.5);
  expect(recorded.badgeOpacity[recorded.badgeOpacity.length - 1]).toBeGreaterThan(0.9);
});

test("with motion on, the hold still compresses and lands with its pop, and selecting still works", async ({
  page,
}) => {
  await page.goto("/library");

  const cell = page.getByRole("main").getByRole("button", { name: new RegExp(seeded.titleName) });
  await expect(cell).toBeVisible();
  await page.waitForLoadState("networkidle");

  const box = await cell.boundingBox();
  expect(box, `no bounding box for the seeded cell "${seeded.titleName}"`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();

  // Mid-hold: the cell is compressed to the press's own quiet-register compression, not
  // merely scaled by some unrelated amount — `press-spring.test.ts` is where that number
  // itself is proven; here it only has to be *some* scale below 1.
  await page.waitForTimeout(HOLD_MS / 2);
  const midHold = await cell.evaluate((element) => getComputedStyle(element).transform);
  expect(midHold).not.toBe("none");

  await page.waitForTimeout(HOLD_MS / 2 + 150);
  await page.mouse.up();

  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();
});
