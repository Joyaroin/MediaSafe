import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #431 — the shared button base wears the press. `app/buttons.ts`'s `BASE` is the
 * one place every button variant is built, so proving the press reaches it is proving it
 * reaches Tonight's row *Mark watched*, the action toast's *Undo*, every *Try again*, the
 * sign-in button and the back control all at once — none of the five opts in on its own,
 * the base does it for all of them.
 *
 * The vitest half (`tests/press-spring.test.ts`) reads the stylesheet and the source as
 * text; this is the one thing only a browser can show — a non-identity computed
 * `transform` while the control is actually `:active`.
 *
 * ── Why a press that never completes a click ─────────────────────────────────────────
 *
 * Every target here either writes (marking an episode, undoing a watch) or navigates (the
 * back control, and — for the sign-in button — a real redirect to Google). A `mouse.down`
 * followed by a `mouse.up` at the same point is a click; releasing somewhere else first is
 * not, in every engine Chromium implements this on. So `pressedTransform` reads the
 * computed style the instant the pointer goes down — which is the whole of what `:active`
 * and `pressable`'s own `&:active` rule need — and then lets go away from the control,
 * proving the press without ever completing the gesture it is a part of.
 */

let rowShow: SeededTitle;
let featuredShow: SeededTitle;
let toastShow: SeededTitle;
let failShow: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  toastShow = await seedShowWithSeason(session.userId, { episodes: 2, watched: [] });
  failShow = await seedShowWithSeason(session.userId, { episodes: 2, watched: [] });
  rowShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  // Watched last, so it is Tonight's featured show and `rowShow` is a row under it —
  // `gestures.spec.ts` seeds in the same order for the same reason.
  featuredShow = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "press-reaches-buttons-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "press-reaches-buttons-session.json") });

/** The scale a finger actually gets, read the instant the pointer goes down and released
 *  away from the control so the gesture never completes as a click or a navigation. */
async function pressedTransform(page: Page, locator: Locator): Promise<string> {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  const transform = await locator.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(x, Math.max(0, y - 300));
  await page.mouse.up();

  return transform;
}

test("Tonight's row Mark watched compresses under a finger", async ({ page }) => {
  await page.goto("/up-next");
  await expect(page.locator("[data-featured]")).toContainText(featuredShow.titleName);

  const row = page
    .getByRole("main")
    .locator("li", { has: page.getByRole("link", { name: new RegExp(rowShow.titleName) }) });
  const mark = row.getByRole("button", {
    name: new RegExp(`^Mark ${rowShow.titleName}, Season 1, Episode 2`),
  });
  await expect(mark).toBeVisible();

  expect(await pressedTransform(page, mark)).not.toBe("none");
});

test("the action toast's Undo compresses under a finger", async ({ page }) => {
  await page.goto(`/titles/${toastShow.libraryEntryId}`);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Mark Season 1, Episode 1 — Fixture Episode 1 watched" })
    .first()
    .click();

  const undo = page.getByRole("status").getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();

  expect(await pressedTransform(page, undo)).not.toBe("none");
});

test("a Try again compresses under a finger", async ({ page }) => {
  await page.goto(`/titles/${failShow.libraryEntryId}`);

  // Every Server Action fails on the wire — `up-next-motion.spec.ts`'s own rule for
  // proving a lost write, restated here for the write-failure toast's `Try again`.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );

  await page
    .getByRole("main")
    .getByRole("button", { name: "Mark Season 1, Episode 1 — Fixture Episode 1 watched" })
    .first()
    .click();

  const tryAgain = page.getByRole("alert").getByRole("button", { name: "Try again" });
  await expect(tryAgain).toBeVisible();

  expect(await pressedTransform(page, tryAgain)).not.toBe("none");
});

test.describe("signed out", () => {
  // No session for this one page — the one route a signed-out reader may reach.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the sign-in button compresses under a finger", async ({ page }) => {
    await page.goto("/sign-in");

    const button = page.getByRole("main").getByRole("button", { name: "Continue with Google" });
    await expect(button).toBeVisible();

    // Never completed as a click: that would start a real redirect to Google.
    expect(await pressedTransform(page, button)).not.toBe("none");
  });
});

test("the back control compresses under a finger", async ({ page }) => {
  await page.goto("/settings");

  const back = page.getByRole("main").getByRole("link", { name: "Back to You" });
  await expect(back).toBeVisible();

  expect(await pressedTransform(page, back)).not.toBe("none");
});
