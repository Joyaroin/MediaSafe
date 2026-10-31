import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedListWithTitles, type SeededList } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #442 — *a title taken off a list leaves with an exit, and the grid closes up*.
 * `tests/e2e/up-next-motion.spec.ts` is the prior art this follows: a leaving row (there,
 * Tonight's) is lifted out of the flow by `AnimatePresence` in `popLayout` mode and the
 * rows left behind take its place by their own layout animation — nothing here is a new
 * spring or a new curve, just that same mechanism reaching the list's icon grid.
 *
 * A narrow viewport, deliberately: `list-icon-grid.tsx`'s grid is three columns with no
 * breakpoint prefix, and three-wide is what turns a one-row-down removal into a visible
 * change of row for the tile that closes the gap — a four-or-more-column grid could
 * leave every surviving tile on the row it already had.
 */

let list: SeededList;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  list = await seedListWithTitles(session.userId, 4);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "list-take-off-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "list-take-off-session.json") });

/** A tile's own `<li>`, found by the title it names — `up-next-motion.spec.ts`'s own
 *  `row` helper, for the icon grid's tiles instead of Tonight's rows. */
const tile = (page: Page, titleName: string) =>
  page
    .getByRole("main")
    .locator("li", { has: page.getByRole("link", { name: new RegExp(titleName) }) });

test("a tile taken off a list fades out while it leaves, and the tile behind it closes the gap without one that never moved animating at all", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/lists/${list.listId}`);

  const [first, second, , fourth] = list.titles;

  const untouched = tile(page, first.titleName);
  const removed = tile(page, second.titleName);
  const closesUp = tile(page, fourth.titleName);

  await expect(untouched).toBeVisible();
  await expect(removed).toBeVisible();
  await expect(closesUp).toBeVisible();

  // The grid's own entrance (`stagger-rise`) is a transform too; let it finish first, the
  // same wait `up-next-motion.spec.ts` gives Tonight's stagger.
  await untouched.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );

  // `fourth` starts a row below `second` in a three-column grid — removing `second` is
  // what brings it up to take the gap, so its top has to fall.
  const closesUpBefore = await closesUp.evaluate((element) => element.getBoundingClientRect().top);
  const untouchedBefore = await untouched.evaluate((element) => element.getBoundingClientRect().top);

  // Watched from before the press: the untouched tile, for any movement at all.
  await untouched.evaluate((element) => {
    const seen = { moved: false };
    (window as unknown as { seenUntouched: typeof seen }).seenUntouched = seen;
    const watch = () => {
      if (getComputedStyle(element).transform !== "none") seen.moved = true;
      requestAnimationFrame(watch);
    };
    watch();
  });

  await removed.getByRole("button", { name: `Take ${second.titleName} off this list` }).click();

  // Taken off, but not gone on the same frame — it is still in the DOM, animating out,
  // exactly as Tonight's own leaving row still carries an animation right after the
  // write fires (`up-next-motion.spec.ts`'s own "a row's tick pops" case).
  const leaving = await removed.evaluate((element) => ({
    animating: element.getAnimations().length > 0,
    opacity: Number(getComputedStyle(element).opacity),
    position: getComputedStyle(element).position,
  }));
  expect(leaving.animating).toBe(true);
  expect(leaving.opacity).toBeLessThan(1);
  // Lifted out of the flow while it fades (`popLayout`), so the grid closes under it now
  // rather than after the exit. This is what needs the tile to take `AnimatePresence`'s
  // `ref`: without it the tile stays in the flow and holds its slot open until it is gone.
  expect(leaving.position).toBe("absolute");

  // It finishes leaving, and the gap behind it closes: the tile a row down comes up to
  // take its place, by a layout animation rather than a jump.
  await expect(removed).toHaveCount(0);
  await expect
    .poll(() => closesUp.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(closesUpBefore);

  // The first tile sits in the row above both of those and was never between them: it
  // never moved, at any frame, and its resting position after is the same as before.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { seenUntouched: { moved: boolean } }).seenUntouched))
    .toMatchObject({ moved: false });
  expect(await untouched.evaluate((element) => element.getBoundingClientRect().top)).toBe(
    untouchedBefore,
  );
});
