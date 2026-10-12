import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Charcoal 13, issue #407 — *Nothing teleports* (handoff §11.2), played in a browser.
 * `tests/motion-moments.test.ts` holds the tokens and the guardrails; this holds each
 * moment to what it draws, and its still version to drawing it without moving.
 *
 * Its own fixture account, and serial: the moments are marks, and each test leaves the
 * library where the next one expects it.
 */

let lost: SeededTitle;
let leaving: SeededTitle;
let above: SeededTitle;
let featuredShow: SeededTitle;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Oldest watch first, so Tonight reads: `featuredShow` featured, then `above`, `leaving`
  // and `lost` as rows, in that order.
  lost = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  leaving = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });
  above = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  featuredShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "up-next-motion-session.json") });

const featured = (page: Page) => page.locator("[data-featured]");
const row = (page: Page, show: SeededTitle) =>
  page.locator("li", { has: page.getByRole("link", { name: new RegExp(show.titleName) }) });
const markEpisode = (show: SeededTitle, episode: number) =>
  `Mark ${show.titleName}, Season 1, Episode ${episode} — Fixture Episode ${episode}, watched`;

test("the featured button narrows into the tick, rings while Undo is offered, then the line rolls", async ({
  page,
}) => {
  await page.goto("/up-next");
  await featured(page).getByRole("button", { name: markEpisode(featuredShow, 2) }).click();

  // The circle is the button's own shape, mid-narrowing: Motion's layout animation, a
  // transform over a box already `56px` wide — never a `width` changing.
  const tick = featured(page).locator("[data-held-tick]");
  const midway = await tick.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    transform: getComputedStyle(element).transform,
    layoutWidth: (element as HTMLElement).offsetWidth,
  }));
  expect(midway.layoutWidth).toBe(56);
  expect(midway.transform).not.toBe("none");
  expect(midway.width).toBeGreaterThan(56);

  await expect(featured(page).getByText("Watched", { exact: true })).toBeVisible();
  await expect(featured(page).getByRole("button", { name: /^Undo marking/ })).toBeVisible();

  // Landed: a 56px circle, still.
  await expect
    .poll(() => tick.evaluate((element) => Math.round(element.getBoundingClientRect().width)))
    .toBe(56);

  // The ring drains for the hold itself — exactly as long as Undo is on screen.
  const ring = featured(page).locator(".undo-ring circle");
  await expect(ring).toHaveCount(1);
  expect(await ring.evaluate((circle) => getComputedStyle(circle).animationDuration)).toBe("1.2s");

  // The hold ends: the button is back, for the next episode, and the line rolled in.
  await expect(
    featured(page).getByRole("button", { name: markEpisode(featuredShow, 3) }),
  ).toBeVisible();
  const line = featured(page).locator(".roll-in", { hasText: "Fixture Episode 3" });
  await expect(line).toHaveCount(1);
  expect(await line.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "roll-in",
  );
  await expect(featured(page)).toContainText("2 of 3");
});

test("finishing the season sets the line in italic serif and joins the segments", async ({
  page,
}) => {
  await page.goto("/up-next");
  const segments = featured(page).getByRole("img", { name: /episodes this season watched/ });
  const segmentsAt = () => segments.evaluate((element) => element.getBoundingClientRect().top);
  const before = await segmentsAt();

  await featured(page).getByRole("button", { name: markEpisode(featuredShow, 3) }).click();

  const finish = featured(page).locator(".roll-in .finish-line", { hasText: "Season 1 done" });
  await expect(finish).toBeVisible();
  expect(await finish.evaluate((element) => getComputedStyle(element).fontStyle)).toBe("italic");
  await expect(featured(page).locator("[data-joined]")).toHaveCount(1);
  // The larger italic line sits in the same line box: nothing under it moved.
  expect(await segmentsAt()).toBe(before);

  // Take it back, so the show stays featured for the tests after this one.
  await featured(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect(featured(page).locator("[data-joined]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
});

test("a row's tick pops and rings, and a finished row leaves for Coming up while the rows above stay still", async ({
  page,
}) => {
  await page.goto("/up-next");

  // The list's own entrance (`stagger-rise`) is a transform too; let it finish first.
  await row(page, above).evaluate((aboveRow) =>
    Promise.all(aboveRow.getAnimations().map((animation) => animation.finished)),
  );

  // Watch the whole document for the poster's flight and the tab's nod, and the row above
  // for any movement at all, from before the press.
  await row(page, above).evaluate((aboveRow) => {
    const seen = { flight: false, nod: false, aboveMoved: false };
    (window as unknown as { seen: typeof seen }).seen = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("poster-flight")) {
            seen.flight = true;
          }
        }
        if (
          record.target instanceof HTMLElement &&
          record.target.matches('[data-nav-icon="/coming-up"]') &&
          record.target.classList.contains("tab-nod")
        ) {
          seen.nod = true;
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
    const watchAbove = () => {
      if (getComputedStyle(aboveRow).transform !== "none") seen.aboveMoved = true;
      requestAnimationFrame(watchAbove);
    };
    watchAbove();
  });

  const below = row(page, lost);
  const belowBefore = await below.evaluate((element) => element.getBoundingClientRect().top);

  await row(page, leaving).getByRole("button", { name: markEpisode(leaving, 2) }).click();

  await expect(row(page, leaving).locator(".check-pop")).toHaveCount(1);
  await expect(row(page, leaving).locator(".undo-ring")).toHaveCount(1);
  await expect(row(page, leaving).getByRole("button", { name: /^Undo marking/ })).toBeVisible();
  const finish = row(page, leaving).locator(".finish-line", { hasText: "Season 1 done" });
  await expect(finish).toBeVisible();
  expect(await finish.evaluate((element) => getComputedStyle(element).fontStyle)).toBe("italic");

  // After the hold the row closes: the row below takes its place, the poster flies, the
  // Coming up icon nods — and the row above never moved.
  await expect(row(page, leaving)).toHaveCount(0);
  await expect
    .poll(() => below.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(belowBefore);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { seen: Record<string, boolean> }).seen))
    .toMatchObject({ flight: true, nod: true, aboveMoved: false });
});

test("a lost write empties the row's tick slowly while the toast arrives", async ({ page }) => {
  await page.goto("/up-next");
  // Every Server Action fails on the wire: the write is lost, as it would be offline.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );

  await row(page, lost).getByRole("button", { name: markEpisode(lost, 2) }).click();

  await expect(page.getByRole("alert").getByText("That did not save")).toBeVisible();
  const tick = row(page, lost).getByRole("button", { name: markEpisode(lost, 2) }).locator("span");
  await expect(tick).toHaveClass(/tick-rewind/);
  expect(await tick.evaluate((element) => getComputedStyle(element).animationDuration)).toBe(
    "0.42s",
  );
});

test.describe("under reduced motion", () => {
  test("the featured tick swaps in without moving, and there is no ring", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/up-next");
    await featured(page).getByRole("button", { name: markEpisode(featuredShow, 3) }).click();

    const tick = featured(page).locator("[data-held-tick]");
    await expect(tick).toBeVisible();
    expect(await tick.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    await expect(featured(page).locator(".undo-ring")).toBeHidden();
    // Undo stays, for the same time.
    await expect(featured(page).getByRole("button", { name: /^Undo marking/ })).toBeVisible();

    await featured(page).getByRole("button", { name: /^Undo marking/ }).click();
  });
});
