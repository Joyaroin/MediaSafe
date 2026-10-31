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
  await expect(grid).not.toHaveAttribute("data-arrived", "true");
  expect(await survivingCell.evaluate((cell) => getComputedStyle(cell).animationName)).toBe(
    "rise-in",
  );

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
