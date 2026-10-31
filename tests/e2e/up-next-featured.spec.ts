import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { TONIGHT_SCRIM } from "@/app/poster-tint";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #362 — the show watched most recently is drawn as the featured card, and it keeps
 * every behaviour of a compact card: mark, hold, Undo, advance, and leaving after its last
 * aired episode, when the next show becomes featured.
 *
 * Its own fixture account, for `up-next-restart.spec.ts`'s reason. The tests run in order
 * and share it: the last one marks the featured show off the rail.
 */

let older: SeededTitle;
let latest: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Seeded in this order, so `latest`'s watch is the more recent and it is featured.
  older = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  latest = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-featured-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "up-next-featured-session.json") });

/** Tonight's featured block — a section of its own since Charcoal (issue #400), not a row. */
const featured = (page: Page) => page.locator("[data-featured]");

for (const [device, size] of [
  ["phone", { width: 500, height: 900 }],
  ["desktop", { width: 1280, height: 900 }],
] as const) {
  test(`features the most recently watched show on a ${device}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/up-next");

    await expect(featured(page)).toHaveCount(1);
    await expect(featured(page)).toContainText(latest.titleName);
    await expect(featured(page)).not.toContainText(older.titleName);
  });
}

/**
 * Issue #434 — the button is a Motion `m.button` with a `layoutId`, so CSS must not set
 * its transform: it presses through Motion's own `whileTap` instead, on `snappy`. A
 * `mouse.down` followed by a `mouse.up` away from the control reads the pressed computed
 * style without ever completing the click — `press-reaches-buttons.spec.ts`'s own
 * technique — which both keeps this test from marking the fixture's episode and proves
 * the scale lets go on release rather than being left behind by the gesture.
 */
test("Tonight's featured Mark watched compresses under a finger and returns on release", async ({
  page,
}) => {
  await page.goto("/up-next");
  // Scoped to the featured card itself: a row elsewhere on the screen can be at the same
  // season and episode number as the featured show and would otherwise match too.
  const mark = page
    .getByRole("main")
    .locator("[data-featured]")
    .getByRole("button", { name: /^Mark .*, Season 1, Episode 2 — / });
  await expect(mark).toBeVisible();

  const box = (await mark.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  // Motion needs a frame (and its lazy-loaded gesture chunk) before the press is applied, so
  // the first read after `mouse.down()` can still be the resting `none` — poll until the
  // scale has actually taken hold rather than reading once.
  await expect
    .poll(() => mark.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe("none");

  await page.mouse.move(x, Math.max(0, y - 300));
  await page.mouse.up();

  await expect
    .poll(() => mark.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");
});

test("the featured card marks, holds, takes an Undo, and advances like any card", async ({
  page,
}) => {
  await page.goto("/up-next");
  const card = featured(page);

  await card.getByRole("button", { name: /^Mark .*, Season 1, Episode 2 — / }).click();
  await expect(card.getByText("Watched")).toBeVisible();
  await card.getByRole("button", { name: /^Undo marking/ }).click();
  await expect(card.getByRole("button", { name: /^Mark .*, Season 1, Episode 2 — / })).toBeVisible();
  // Let the Undo's write and its render land first: an immediate re-mark is #390's race,
  // with its own spec (`up-next-undo-remark.spec.ts`).
  await page.waitForLoadState("networkidle");

  await card.getByRole("button", { name: /^Mark .*, Season 1, Episode 2 — / }).click();
  // The hold ends and the next episode slides in, still on the featured card.
  await expect(card.getByRole("button", { name: /^Mark .*, Season 1, Episode 3 — / })).toBeVisible();
  await expect(card).toContainText(latest.titleName);
});

test("when the featured show leaves, the next show is featured", async ({ page }) => {
  await page.goto("/up-next");
  const card = featured(page);

  await card.getByRole("button", { name: /^Mark .*, Season 1, Episode 3 — / }).click();
  await expect(card.getByText("Season 1 done")).toBeVisible();

  await expect(featured(page)).toContainText(older.titleName, { timeout: 10_000 });
  await expect(page.getByText(latest.titleName)).toHaveCount(0);
});

/**
 * The scrims are measured from the text — `tests/poster-tint.test.ts` composites them on
 * that assumption, and only a browser can check the layout keeps it: the text block's own
 * top padding is the `ground` scrim's fade, at each layout's measure, and that scrim never
 * reaches up under the white *Tonight*, where in the light theme its pale `ground` would put
 * white on white. By the time these run the older show is featured, which is all they
 * need; at a phone width and at the `xl:` card.
 */
for (const [layout, size] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
] as const) {
  test(`the ${layout} scrims are measured from the text and stay clear of the white title`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/up-next");
    await expect(featured(page)).toHaveCount(1);

    const measured = await featured(page).evaluate((section) => {
      const text = section.querySelector<HTMLElement>("[data-tonight-text]")!;
      const title = section.querySelector("h1")!;
      return {
        fade: parseFloat(getComputedStyle(text).paddingTop),
        textTop: text.getBoundingClientRect().top,
        titleBottom: title.getBoundingClientRect().bottom,
      };
    });

    expect(measured.fade).toBe(TONIGHT_SCRIM.ground[layout].fadeAbove);
    expect(measured.textTop).toBeGreaterThanOrEqual(measured.titleBottom);
  });
}

test("one h1 on the screen, and it is Tonight", async ({ page }) => {
  await page.goto("/up-next");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tonight");
});

