import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #430 — the stagger plays once per arrival of a screen.
 *
 * `useArrivedOnce()` (`app/use-arrived-once.ts`) is the memory a `stagger-rise` container
 * carries as `data-arrived="true"`, and `globals.css`'s `.stagger-rise[data-arrived="true"]
 * > *` is what stops `rise-in` once it is set. `tests/use-arrived-once.test.ts` proves the
 * hook's own clock and the stylesheet rule as text; this proves what a reader actually
 * sees: a fresh arrival at Library still rises, and a filter chip pressed afterwards does
 * not replay that rise on the posters it leaves standing.
 *
 * Two titles, in two different states, so *the surviving posters are not re-animated* is
 * provable rather than vacuous: one answers the *Watching* chip and stays, the other does
 * not and leaves — a filter actually narrowing the grid, not a chip with nothing to do.
 */

let watching: SeededTitle;
let caughtUp: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Unwatched aired episode left: `library_entry_state` reads this as *watching*.
  watching = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });
  // Everything aired is watched, the show still in production: *caught up*, not *watching*.
  caughtUp = await seedShowWithSeason(session.userId, { episodes: 1, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "stagger-once-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "stagger-once-session.json") });

test("a fresh arrival at Library stages its rows, and a filter chip afterwards does not replay it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // The arrival is recorded the moment the grid first appears, not looked for after
  // `goto`: `goto` waits for the load event and the cell's visibility after that, by which
  // time the 380ms arrival window can already have closed — the check raced the clock it
  // was checking. An init script runs before any of the page's own code.
  await page.addInitScript(() => {
    const record = { seen: false, arrivedAtFirstSight: false, firstCellAnimation: "" };
    (window as unknown as { staggerFirstSight: typeof record }).staggerFirstSight = record;
    const look = () => {
      if (record.seen) return;
      const grid = document.querySelector("main ol.stagger-rise");
      const cell = grid?.firstElementChild;
      if (!grid || !cell) return;
      record.seen = true;
      record.arrivedAtFirstSight = grid.getAttribute("data-arrived") === "true";
      record.firstCellAnimation = getComputedStyle(cell).animationName;
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true });
  });

  await page.goto("/library");

  // Through `main`, not the bare page: for ~300ms after a load React's streamed copy of
  // the page waits in a hidden `#S:0` div, and a role lookup is what skips it.
  const main = page.getByRole("main");
  const grid = main.locator("ol.stagger-rise");
  const survivingCell = main.locator("li", {
    has: page.getByRole("button", { name: new RegExp(watching.titleName) }),
  });
  const leavingCell = main.locator("li", {
    has: page.getByRole("button", { name: new RegExp(caughtUp.titleName) }),
  });

  await expect(survivingCell).toBeVisible();

  // ── A fresh arrival rises ────────────────────────────────────────────────────────────
  // `data-arrived` has not been set yet — this screen has not had time to finish its own
  // entrance — so the stylesheet's override does not apply, and the cell is still carrying
  // the entrance `@utility stagger-rise` gives every one of its children.
  const firstSight = await page.evaluate(
    () =>
      (
        window as unknown as {
          staggerFirstSight: { seen: boolean; arrivedAtFirstSight: boolean; firstCellAnimation: string };
        }
      ).staggerFirstSight,
  );
  expect(firstSight.seen).toBe(true);
  expect(firstSight.arrivedAtFirstSight).toBe(false);
  expect(firstSight.firstCellAnimation).toBe("rise-in");

  // ── Once arrived, a filter chip does not replay it ──────────────────────────────────
  await expect(grid).toHaveAttribute("data-arrived", "true");
  expect(await survivingCell.evaluate((cell) => getComputedStyle(cell).animationName)).toBe(
    "none",
  );

  await main.getByRole("button", { name: "Watching", exact: true }).click();

  // The chip actually narrowed the grid: the non-matching title left...
  await expect(leavingCell).toHaveCount(0);
  // ...and the matching one stayed, carrying no entrance transform at all — `animation:
  // none` is what `data-arrived="true"` holds it to, not merely a finished animation that
  // could still be retriggered by the sibling above it leaving.
  await expect(survivingCell).toBeVisible();
  expect(await survivingCell.evaluate((cell) => getComputedStyle(cell).animationName)).toBe(
    "none",
  );
  expect(await survivingCell.evaluate((cell) => getComputedStyle(cell).transform)).toBe("none");
});
