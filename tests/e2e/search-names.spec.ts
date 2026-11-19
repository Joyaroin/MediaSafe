import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #536 — Search's buttons are announced by the words they show.
 *
 * Every Search result button's accessible name **begins with its visible label** (WCAG
 * 2.5.3), and **Add comes before the seen-it button** in DOM and tab order (WCAG 2.4.3).
 * This is the one Search spec: #550 extends this file rather than starting a second.
 *
 * Search reaches the live catalogue, so, like `one-app.spec.ts`'s Search test, it skips
 * on a placeholder TMDB token rather than failing. Its own fixture account: nothing here
 * is in the library, so every result offers both buttons.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

test.skip(
  (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-"),
  "needs a real TMDB_READ_ACCESS_TOKEN",
);

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "search-names-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "search-names-session.json") });

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchFor(page: Page, query: string): Promise<Locator> {
  await page.goto("/search");
  await page.getByLabel("Search films and shows").fill(query);
  await expect(page.getByRole("heading", { name: "Shows", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Films", level: 2 })).toBeVisible();
  return page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Add / }) });
}

for (const viewport of [
  { label: "phone", size: PHONE },
  { label: "desktop", size: DESKTOP },
]) {
  test(`every Search button is found by its visible label, on a ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport.size);
    const rows = await searchFor(page, "Severance");

    const count = await rows.count();
    // The setup: the search returned rows, and they include both kinds, so the
    // assertions below are not vacuous.
    expect(count).toBeGreaterThan(1);
    let shows = 0;
    let films = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const isShow = (await row.getByText(/· Show$/).count()) === 1;
      const seenLabel = isShow ? "I've seen it all" : "I've seen it";
      if (isShow) shows += 1;
      else films += 1;

      const title = (await row.getByRole("heading", { level: 3 }).innerText()).trim();

      // Found by its visible label, as a voice-control user would say it.
      const seen = row.getByRole("button", {
        name: new RegExp(`^${seenLabel}: `),
      });
      await expect(seen).toHaveCount(1);
      await expect(seen).toContainText(seenLabel);
      await expect(seen).toHaveAccessibleName(
        isShow ? `${seenLabel}: ${title}, every aired episode` : `${seenLabel}: ${title}`,
      );

      const add = row.getByRole("button", { name: /^Add/ });
      await expect(add).toHaveCount(1);
      await expect(add).toHaveText("Add");
      await expect(add).toHaveAccessibleName(new RegExp(`^Add ${escapeRegExp(title)}`));

      // DOM order: Add before the seen-it button.
      const order = await row.getByRole("button").evaluateAll((buttons) =>
        buttons.map((b) => (b.textContent ?? "").trim()),
      );
      expect(order).toEqual(["Add", seenLabel]);
    }

    expect(shows).toBeGreaterThan(0);
    expect(films).toBeGreaterThan(0);
  });
}

test("Add precedes the seen-it button in tab order", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const rows = await searchFor(page, "Severance");
  const row = rows.first();

  // Start on the title's link, so the Tabs below are the row's own, then press Tab.
  await row.getByRole("link").first().focus();
  await page.keyboard.press("Tab");
  await expect(row.getByRole("button", { name: /^Add/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row.getByRole("button", { name: /^I've seen it/ })).toBeFocused();
});
