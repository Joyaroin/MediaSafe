import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #463 — the shared button base wears the press (handoff/#428). `tests/press-spring
 * .test.ts` proves the stylesheet; this proves what a reader actually gets: a real pointer
 * held down over a real button, and the computed `transform` it produces — the one thing
 * no amount of reading CSS as text can stand in for.
 *
 * Two surfaces: a plain button built from `app/buttons.ts`'s `BASE` (the sign-in screen's
 * *Continue with Google*, signed out, no fixture needed), and the one button that must
 * *not* press in CSS at all — Tonight's featured *Mark watched*, a Motion `m.button`
 * carrying a `layoutId`.
 */

/** The matrix a `scale(s)` transform computes to, with no rotation or skew. */
function scaleOf(transform: string): number {
  const match = transform.match(/^matrix\(([^,]+),\s*([^,]+),/);
  expect(match, `${transform} is not a 2D matrix`).not.toBeNull();
  const [, a, b] = match!;
  expect(Number(b)).toBeCloseTo(0, 5);
  return Number(a);
}

/** Holds the pointer down over `target`'s centre, reads its computed `transform` once the
 *  press's own transition (`--dur-press`, 100ms) has had time to settle, then releases the
 *  pointer away from the element so no click is ever dispatched on it. */
async function pressedTransform(page: Page, target: Locator): Promise<string> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const transform = await target.evaluate((el) => getComputedStyle(el).transform);
  // Away from the element before releasing: a mouseup over the same box as the mousedown
  // is a click, and this button's own `onClick` starts a real OAuth round trip.
  await page.mouse.move(0, 0);
  await page.mouse.up();

  return transform;
}

test.describe("a plain button built from the shared base", () => {
  // Signed out: `/sign-in` is the one route a signed-out reader reaches, and its one
  // control is `PRIMARY_BUTTON_LARGE` — the base this ticket changes, used bare.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the sign-in button's computed transform scales down while pressed", async ({ page }) => {
    await page.goto("/sign-in");
    const button = page
      .getByRole("main")
      .getByRole("button", { name: "Continue with Google", exact: true });
    await expect(button).toBeVisible();

    const resting = await button.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const pressed = await pressedTransform(page, button);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);

    // Released, back to resting — the compression is a transition and not a stuck state.
    await page.waitForTimeout(200);
    expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("hover's own brightness still changes the button's filter", async ({ page }) => {
    await page.goto("/sign-in");
    const button = page
      .getByRole("main")
      .getByRole("button", { name: "Continue with Google", exact: true });
    await expect(button).toBeVisible();

    const idle = await button.evaluate((el) => getComputedStyle(el).filter);
    await button.hover();
    await page.waitForTimeout(200);
    const hovered = await button.evaluate((el) => getComputedStyle(el).filter);

    // `hover:brightness-95` — a filter and not a fill, and it still transitions now that
    // it rides `pressable`'s own transition list rather than the base's deleted one.
    expect(hovered).not.toBe(idle);
  });
});

test.describe("Tonight's featured Mark watched", () => {
  let show: SeededTitle;

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    show = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

    const authDir = path.join(__dirname, ".auth");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      path.join(authDir, "press-reaches-buttons-session.json"),
      JSON.stringify(toStorageState(session), null, 2),
    );
  });

  test.use({
    storageState: path.join(__dirname, ".auth", "press-reaches-buttons-session.json"),
  });

  test("carries no pressable class and no CSS transform while pressed", async ({ page }) => {
    await page.goto("/up-next");
    const featured = page.locator("[data-featured]");
    const button = featured.getByRole("button", {
      name: new RegExp(`^Mark ${show.titleName}, Season 1, Episode 2 — `),
    });
    await expect(button).toBeVisible();

    // No CSS press at all: the class the shared base would otherwise add is absent.
    const classes = await button.evaluate((el) => el.className);
    expect(classes.split(/\s+/)).not.toContain("pressable");

    const resting = await button.evaluate((el) => getComputedStyle(el).transform);
    const pressed = await pressedTransform(page, button);

    // Whatever Motion's layout tracking leaves on the element (`layoutId`), it does not
    // change between resting and `:active` — nothing in CSS answers a press on this
    // control. Its own Motion press (`whileTap`) is a separate ticket's work.
    expect(pressed).toBe(resting);
  });
});
