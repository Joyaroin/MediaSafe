import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedListWithTitles, seedShowWithSeason } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #433 — the surfaces that were still inert answer the finger the same way every
 * other control does: the search screen's recommendation cards, Tonight's suggestion
 * cards, a list's title rows, the watch menu's option rows, Settings' plate rows and the
 * sidebar's navigation items.
 *
 * The vitest half (`tests/press-spring.test.ts`) reads the stylesheet and the call sites
 * as text; this is the one thing only a browser can show — a non-identity computed
 * `transform` while each surface is actually `:active`. `press-reaches-buttons.spec.ts`
 * (issue #431) is the prior art for the gesture this reuses: a pointer goes down, the
 * computed style is read the instant `:active`/`data-pressed` apply, and the pointer lets
 * go away from the control so the press is proven without ever completing the navigation
 * or write it sits in front of.
 *
 * Each `describe` mints its own fixture account in its own `storageState` file, the way
 * `press-reaches-buttons.spec.ts` itself does — `test.use` names the path at the top of
 * the block, synchronously, and `beforeAll` writes it before any test in the block runs.
 * One account per block rather than one shared account, for `up-next-suggestions.spec.ts`'s
 * reason: the surfaces under test here read or write real state (a watched show, a list,
 * Up next's own emptiness), and sharing one account across them would make one block's
 * state the next block's bug.
 */

const AUTH_DIR = path.join(__dirname, ".auth");

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

/**
 * ── The two rails read TMDB live ──────────────────────────────────────────────────────
 *
 * `recommendation-rail.tsx` and `suggestion-rail.tsx` both read real recommendations (the
 * search screen's "Because you watched") or real trending titles (Tonight's empty-state
 * "Trending this week") from TMDB — there is no fixture for either, the same guard
 * `search-add-roll.spec.ts` and `up-next-suggestions.spec.ts` already use: unprovable
 * without a real `TMDB_READ_ACCESS_TOKEN`, not failing for it.
 */
const needsLiveTmdb = (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-");

test.describe("a recommendation card", () => {
  test.skip(needsLiveTmdb, "needs a real TMDB_READ_ACCESS_TOKEN");

  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-recommend-session.json");
  test.use({ storageState: storageStatePath });

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));
  });

  test("compresses under a finger", async ({ page }) => {
    // A seed "Because you watched" needs a real, well-known show, watched in full through
    // the search screen's own "Add watched" pill — the same live catalogue
    // `search-add-roll.spec.ts` reaches, and popular enough that TMDB has recommendations
    // for it.
    await page.goto("/search");
    const main = page.getByRole("main");
    await main.getByLabel("Search films and shows").fill("Breaking Bad");

    const row = main
      .locator("li", { has: page.getByRole("heading", { name: "Breaking Bad", exact: true }) })
      .first();
    await expect(row).toBeVisible();
    // The *Add watched* pill by its exact name (`catalogue/add-watched.ts`'s show label). A
    // role name matches as a substring by default, so "Add Breaking Bad to your library"
    // alone also finds the plain *Add* — and the plain add records no watch, while the
    // rail below is seeded from the most recently watched title, so it would never render.
    await row
      .getByRole("button", {
        name: "Add Breaking Bad to your library, recording every released episode as watched",
        exact: true,
      })
      .click();
    await expect(
      row.getByRole("link", { name: "Breaking Bad is in your library — open it" }),
    ).toBeVisible();

    // A fresh visit, so the server re-renders the rail against the seed just watched.
    await page.goto("/search");
    const rail = main.getByRole("list", { name: "Because you watched" });
    await expect(rail).toBeVisible({ timeout: 15_000 });

    // The card's own link — a surface, pressing at the default register.
    const card = rail.locator("li").first();
    const link = card.locator("a").first();
    expect(await pressedTransform(page, link)).not.toBe("none");
  });
});

test.describe("a suggestion card", () => {
  test.skip(needsLiveTmdb, "needs a real TMDB_READ_ACCESS_TOKEN");

  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-suggest-session.json");
  test.use({ storageState: storageStatePath });

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));
  });

  test("compresses under a finger", async ({ page }) => {
    await page.goto("/up-next");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Nothing queued for tonight" })).toBeVisible();

    const rail = main.getByRole("list", { name: "Trending this week" });
    await expect(rail).toBeVisible({ timeout: 15_000 });

    // The card's own link, not its sibling *Add* pill: the card is a second, quieter
    // press on the poster/name link, and the pill keeps its own register and its own
    // press, independent of the card.
    const card = rail.locator("li").first();
    const link = card.locator("a").first();
    expect(await pressedTransform(page, link)).not.toBe("none");
  });
});

test.describe("a list's title row", () => {
  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-list-row-session.json");
  test.use({ storageState: storageStatePath });

  let listId: string;
  let titleName: string;

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));

    const list = await seedListWithTitles(session.userId, 3);
    listId = list.listId;
    titleName = list.titles[0].titleName;
  });

  test("compresses under a finger", async ({ page }) => {
    await page.goto(`/lists/${listId}`);
    const row = page.getByRole("main").getByRole("link", { name: new RegExp(titleName) });
    await expect(row).toBeVisible();

    expect(await pressedTransform(page, row)).not.toBe("none");
  });
});

test.describe("a watch menu option row", () => {
  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-watch-menu-session.json");
  test.use({ storageState: storageStatePath });

  let libraryEntryId: string;

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));

    const show = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });
    libraryEntryId = show.libraryEntryId;
  });

  test("compresses under a finger", async ({ page }) => {
    await page.goto(`/titles/${libraryEntryId}`);
    const main = page.getByRole("main");

    await main
      .getByRole("button", {
        name: "Season 1, Episode 1 — Fixture Episode 1, watched. Change this watch",
      })
      .click();

    const rewatch = page.getByRole("dialog").getByRole("button", { name: "Rewatch" });
    await expect(rewatch).toBeVisible();

    expect(await pressedTransform(page, rewatch)).not.toBe("none");
  });
});

test.describe("a Settings row", () => {
  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-settings-session.json");
  test.use({ storageState: storageStatePath });

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));
  });

  test("compresses under a finger", async ({ page }) => {
    await page.goto("/settings");
    const row = page.getByRole("main").getByRole("link", { name: "Import a library" });
    await expect(row).toBeVisible();

    expect(await pressedTransform(page, row)).not.toBe("none");
  });
});

test.describe("a sidebar item", () => {
  const storageStatePath = path.join(AUTH_DIR, "press-reaches-surfaces-sidebar-session.json");
  test.use({ storageState: storageStatePath });

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));
  });

  test("compresses under a finger", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/up-next");

    const sidebar = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
    const item = sidebar.getByRole("link", { name: "Search" });
    await expect(item).toBeVisible();

    expect(await pressedTransform(page, item)).not.toBe("none");
  });
});
