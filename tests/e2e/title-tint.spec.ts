import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { washFor } from "@/app/poster-tint";
import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";

import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #361 in a real browser: the title page hero washes in the title's poster colour,
 * in the theme the reader is in, and a title with no colour draws the untinted hero.
 *
 * The colour is written straight onto the fixture title rather than extracted: fixture
 * posters are not real TMDB images, and extraction has its own tests
 * (`tests/poster-colour.test.ts`, `tests/poster-colour-fill.test.ts`). What only a browser
 * can show is which wash `app/globals.css` resolves as `--tint` for each theme.
 */

const COLOUR = "#aa3119";

let tinted: SeededTitle;
let plain: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  tinted = await seedWatchingShow(session.userId);
  plain = await seedWatchingShow(session.userId);

  const pool = createPool(requireDatabaseUrl());
  try {
    await drizzle(pool, { schema })
      .update(schema.title)
      .set({ posterColour: COLOUR })
      .where(eq(schema.title.name, tinted.titleName));
  } finally {
    await pool.end();
  }

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-tint-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-tint-session.json") });

/** The hero section, and the `--tint` it resolved. */
async function heroTint(page: Page, entry: SeededTitle): Promise<string | null> {
  await page.goto(`/titles/${entry.libraryEntryId}`);
  const hero = page
    .getByRole("heading", { level: 1, name: entry.titleName })
    .locator("xpath=ancestor::section[1]");
  await expect(hero).toBeVisible();
  return hero.evaluate((el) => {
    const value = getComputedStyle(el).getPropertyValue("--tint").trim();
    return value === "" ? null : value;
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the hero takes the poster's ${theme} wash`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const tint = await heroTint(page, tinted);
    expect(tint).toBe(washFor(COLOUR, theme));
  });
}

test("a title with no colour draws the untinted hero", async ({ page }) => {
  expect(await heroTint(page, plain)).toBeNull();
  await expect(page.locator(".poster-tint")).toHaveCount(0);
});
