import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #452 — the sort control shows it is working, proven in a real browser.
 *
 * `tests/library-pending.test.ts` drives `SortSelectFace` directly with a `pending` prop
 * and proves the face renders correctly for either value of it — but `SortSelect`
 * (`library-filter-bar.tsx`), the half that actually sets `pending` from `useTransition`'s
 * `isPending` and calls `router.push` inside `startTransition`, has no mounted router and
 * no DOM in that suite's `environment: "node"`. Nothing there would catch `pending={false}`
 * hard-coded at the call site, or `startTransition` dropped altogether — the Vitest suite
 * would stay green either way. This is the seam that does catch it: a real sort change,
 * against a real (and, in the second test, a really failing) navigation.
 *
 * Reuses `pending-hold.spec.ts`'s own technique for making a client-side navigation to
 * `/library` slow or failing, without touching any application code — see that file's
 * docblock for why the `rsc` header and the `next-router-prefetch` header are what single
 * out the one fetch under test.
 */

let seeded: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  seeded = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "sort-pending-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "sort-pending-session.json") });

/** Delays every client-side navigation fetch to `/library` by `delayMs` — the request
 *  the sort select's own `router.push` fires, never the initial `goto` (a document
 *  request, carrying no `rsc` header) and never a sidebar prefetch (carrying
 *  `next-router-prefetch`). */
async function delaySortNavigation(page: Page, delayMs: number): Promise<void> {
  await page.route("**/library**", async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] === "1" && !headers["next-router-prefetch"]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

/** Fails the first client-side navigation fetch to `/library` with a non-OK response, the
 *  way a real server error would — Next's own `fetchServerResponse`
 *  (`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js`)
 *  treats `!res.ok` exactly like a network error: it falls back to a full browser
 *  navigation to the same URL rather than leaving the SPA's transition hanging. Only the
 *  first such request fails — the browser's own follow-up document request, and anything
 *  after it, must go through untouched or the page could never actually arrive. */
async function failFirstSortNavigation(page: Page): Promise<void> {
  let failed = false;
  await page.route("**/library**", async (route) => {
    const headers = route.request().headers();
    if (!failed && headers["rsc"] === "1" && !headers["next-router-prefetch"]) {
      failed = true;
      await route.fulfill({ status: 500, body: "" });
      return;
    }
    await route.continue();
  });
}

test("the sort control shows pending while a real navigation is in flight, clears when the new order renders, and the grid does not re-stagger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/library");

  const main = page.getByRole("main");
  const grid = main.locator("ol.stagger-rise");
  const cell = main.locator("li", {
    has: page.getByRole("button", { name: new RegExp(seeded.titleName) }),
  });

  await expect(cell).toBeVisible();
  // The arrival stagger has to have finished before this test's own assertions start, or
  // a cell still carrying `rise-in` for its own arrival would be indistinguishable from
  // one replaying it for the sort change this test triggers next.
  await expect(grid).toHaveAttribute("data-arrived", "true");
  expect(await cell.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");

  const select = main.getByLabel("Sort the library");
  const face = select.locator("xpath=..");

  // ── Idle, before anything is touched ────────────────────────────────────────────────
  await expect(face).not.toHaveAttribute("aria-busy", "true");
  await expect(face).not.toHaveClass(/opacity-60/);
  await expect(select).not.toBeDisabled();
  await expect(select).toHaveClass(/cursor-pointer/);

  await delaySortNavigation(page, 1000);
  await select.selectOption("recently-added");

  // ── Pending, from the moment the select changes ─────────────────────────────────────
  await expect(face).toHaveAttribute("aria-busy", "true");
  await expect(face).toHaveClass(/opacity-60/);
  await expect(select).toBeDisabled();
  await expect(select).toHaveClass(/cursor-wait/);

  // The grid is still mounted and still not replaying its arrival while the navigation
  // this sort change started is still in flight.
  expect(await cell.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");

  // ── Cleared, once the new order has rendered ────────────────────────────────────────
  await expect(page).toHaveURL(/sort=recently-added/, { timeout: 10_000 });
  await expect(face).not.toHaveAttribute("aria-busy", "true");
  await expect(face).not.toHaveClass(/opacity-60/);
  await expect(select).not.toBeDisabled();
  await expect(select).toHaveClass(/cursor-pointer/);

  // The sorted order arriving is not an arrival: the same grid is still mounted
  // (`data-arrived` never went back to unset) and the surviving cell never replayed
  // `rise-in`.
  await expect(grid).toHaveAttribute("data-arrived", "true");
  await expect(cell).toBeVisible();
  expect(await cell.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});

test("a sort navigation that fails still lands on the new order, rather than leaving the control stuck pending", async ({
  page,
}) => {
  await page.goto("/library");

  const main = page.getByRole("main");
  await expect(main.locator("ol.stagger-rise")).toHaveAttribute("data-arrived", "true");

  const select = main.getByLabel("Sort the library");
  const face = select.locator("xpath=..");
  await expect(face).not.toHaveAttribute("aria-busy", "true");

  await failFirstSortNavigation(page);
  await select.selectOption("release-year");

  // React resolves a transition's pending state on either outcome, and Next's own
  // fallback for a failed fetch is a full browser navigation to the same URL — between
  // the two, there is no path left on which this sticks mid-navigation.
  await expect(page).toHaveURL(/sort=release-year/, { timeout: 10_000 });

  const selectAfter = main.getByLabel("Sort the library");
  const faceAfter = selectAfter.locator("xpath=..");
  await expect(faceAfter).not.toHaveAttribute("aria-busy", "true");
  await expect(faceAfter).not.toHaveClass(/opacity-60/);
  await expect(selectAfter).not.toBeDisabled();
});
