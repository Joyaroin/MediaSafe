import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #474 (handoff §11.2, spec #428): the title page's *N of M* count rolls when an
 * episode is marked, the way Tonight's does — `tests/e2e/up-next-motion.spec.ts:86-91` is
 * the prior art this mirrors.
 *
 * Marking is optimistic (`watch-marks.ts`), so `seasonWatchProgress` recomputes on the
 * press itself — no wait for the server is needed before the roll starts.
 */

let show: SeededTitle;
let reducedMotionShow: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Three episodes, one watched: the main button offers episode 2, and the count starts
  // at "1 of 3" with room to roll to "2 of 3". Each test marks for real (the write is not
  // undone), so each gets its own seeded show rather than sharing one.
  show = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  reducedMotionShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-count-roll-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-count-roll-session.json") });

// The main action button and the episode row's own mark control carry the same accessible
// name (`title-actions.tsx`'s `MarkEpisodeButton`, `programme-note-episodes.tsx`'s row
// control) — `.first()` is the main button, which `TitleHero`'s `actions` renders before
// the episode list in document order.
const markButton = (page: Page, episode: number, name: string) =>
  page
    .getByRole("main")
    .getByRole("button", {
      name: `Mark Season 1, Episode ${episode} — ${name} watched`,
      exact: true,
    })
    .first();

/** The gap between the count's `Roll` cell and the still season heading beside it, in
 *  pixels — measuring boxes rather than `textContent` is the only way to catch the row's
 *  flex layout swallowing the heading's leading space (issue #474's own regression). */
async function visibleGap(countCell: Locator, heading: Locator): Promise<number> {
  const [countRight, headingLeft] = await Promise.all([
    countCell.evaluate((element) => element.getBoundingClientRect().right),
    heading.evaluate((element) => element.getBoundingClientRect().left),
  ]);
  return headingLeft - countRight;
}

test("marking an episode rolls the count, in the same beat as the bar, and the season heading stays still", async ({
  page,
}) => {
  await page.goto(`/titles/${show.libraryEntryId}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: show.titleName })).toBeVisible();

  const countCell = main.locator(".count-roll");
  const heading = main.locator("[data-season-heading]");
  await expect(countCell).toContainText("1 of 3");
  await expect(heading).toHaveText(" · Season 1");

  const headingBefore = await heading.evaluate((element) => element.getBoundingClientRect());
  const gapBefore = await visibleGap(countCell, heading);
  // A real visible gap, not the collapsed-space regression where the heading sat flush
  // against the count's right edge.
  expect(gapBefore).toBeGreaterThan(2);

  const fill = main.locator(".progress-fill");
  const fillDuration = await fill.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );

  await markButton(page, 2, "Fixture Episode 2").click();

  // The old value leaves and the new one rises in, through `Roll` — the same mechanism
  // Tonight uses, never a bespoke odometer.
  const leaving = countCell.locator(".roll-out");
  await expect(leaving).toHaveCount(1);
  await expect(leaving).toContainText("1 of 3");
  expect(await leaving.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "roll-out",
  );

  const risen = countCell.locator(".roll-in");
  await expect(risen).toHaveCount(1);
  await expect(risen).toContainText("2 of 3");
  expect(await risen.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "roll-in",
  );

  // The same beat as the progress bar's fill: both time off the same duration token.
  const fillDurationAfter = await fill.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(fillDurationAfter).toBe(fillDuration);
  expect(await risen.evaluate((element) => getComputedStyle(element).animationDuration)).toBe(
    fillDurationAfter,
  );

  // The season heading beside the count does not move when only the count changes.
  await expect(heading).toHaveText(" · Season 1");
  const headingAfter = await heading.evaluate((element) => element.getBoundingClientRect());
  expect(headingAfter.top).toBe(headingBefore.top);
  expect(headingAfter.left).toBe(headingBefore.left);
  expect(await heading.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "none",
  );

  // Still a visible gap, not the regression's collapsed space.
  const gapAfter = await visibleGap(countCell, heading);
  expect(gapAfter).toBeGreaterThan(2);

  // The text a reader and a screen reader get is unchanged: the whole line still reads
  // "2 of 3 · Season 1".
  await expect(main).toContainText("2 of 3 · Season 1");
});

test("under reduced motion the count changes as a fade on --dur-roll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/titles/${reducedMotionShow.libraryEntryId}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: reducedMotionShow.titleName }),
  ).toBeVisible();

  const countCell = main.locator(".count-roll");
  await expect(countCell).toContainText("1 of 3");

  await markButton(page, 2, "Fixture Episode 2").click();

  const risen = countCell.locator(".roll-in");
  await expect(risen).toHaveCount(1);
  await expect(risen).toContainText("2 of 3");
  const style = await risen.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { animationName: computed.animationName, animationDuration: computed.animationDuration };
  });
  expect(style.animationName).toBe("roll-in");
  expect(style.animationDuration).toBe("0.28s");

  // A fade, never a cut — the roll itself does not translate under reduced motion.
  expect(await risen.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});
