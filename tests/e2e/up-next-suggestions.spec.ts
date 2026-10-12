import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #365 — a new reader's empty Up next offers titles to add, and adding one is the
 * search screen's one-tap add. A new reader has watched nothing, so this is the trending
 * fallback; the choice between the two rails is unit-tested in
 * `tests/up-next-suggestions.test.ts`. Reads TMDB live, as the search spec does.
 *
 * Its own fixture account, so the add cannot leak into the shared empty one.
 */

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-suggestions-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "up-next-suggestions-session.json"),
});

test("an empty Up next offers trending titles, and one tap adds one", async ({ page }) => {
  await page.goto("/up-next");
  // The page itself: the pager and its *Watching* tab panel went with Charcoal slice 5
  // (issue #399), and Tonight is one screen.
  const watching = page.getByRole("main");

  await expect(watching.getByRole("heading", { name: "Nothing queued for tonight" })).toBeVisible();
  const rail = watching.getByRole("list", { name: "Trending this week" });
  await expect(rail).toBeVisible({ timeout: 15_000 });

  // A film: Tonight lists films to watch, while a show added with nothing watched waits on
  // the watchlist — so adding a trending *show* would rightly leave Tonight empty, and the
  // test would depend on what is trending this week.
  const filmCard = rail.locator("li", { has: page.locator('a[href^="/catalogue/film/"]') }).first();
  test.skip((await filmCard.count()) === 0, "nothing trending this week is a film");
  const add = filmCard.getByRole("button", { name: /^Add .* to your library$/ });
  const label = (await add.getAttribute("aria-label")) ?? "";
  const name = label.replace(/^Add /, "").replace(/ to your library$/, "");
  await add.click();

  // The add lands and Up next re-renders with the title on it, the empty state gone.
  await expect(watching.getByRole("heading", { name: "Nothing queued for tonight" })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
  await expect(watching.getByText(name, { exact: true }).first()).toBeVisible();
});
