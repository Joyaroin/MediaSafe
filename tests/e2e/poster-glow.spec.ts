import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { glowFor } from "@/app/poster-tint";
import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";

import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #363 in a real browser: hovering a poster in the Library grid or a You rail
 * lights a glow in the title's own colour, a title with no colour never glows, and a
 * device that cannot hover never glows.
 *
 * The colour is written straight onto the fixture title, for `title-tint.spec.ts`'s
 * reason: fixture posters are not real images.
 */

let coloured: SeededTitle;
let plain: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  coloured = await seedWatchingShow(session.userId);
  plain = await seedWatchingShow(session.userId);

  const pool = createPool(requireDatabaseUrl());
  try {
    await drizzle(pool, { schema })
      .update(schema.title)
      .set({ posterColour: "#1e3cdc" })
      .where(eq(schema.title.name, coloured.titleName));
  } finally {
    await pool.end();
  }

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "poster-glow-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "poster-glow-session.json") });

/** The tile that names `entry`, wherever the surface draws it. */
function tileFor(page: Page, entry: SeededTitle): Locator {
  return page.locator(".pressable", { hasText: entry.titleName }).first();
}

/** The glow wrapper's `box-shadow` once the pointer is on the tile, settled. */
async function glowOnHover(page: Page, tile: Locator): Promise<string | null> {
  await tile.scrollIntoViewIfNeeded();
  await tile.hover();
  const glow = tile.locator(".poster-glow");
  if ((await glow.count()) === 0) return null;
  // Past the transition, so the value read is the settled one.
  await page.waitForTimeout(400);
  return glow.evaluate((el) => getComputedStyle(el).boxShadow);
}

for (const surface of ["/library", "/you"] as const) {
  test(`a poster on ${surface} glows in its own colour on hover`, async ({ page }) => {
    await page.goto(surface);
    const shadow = await glowOnHover(page, tileFor(page, coloured));
    expect(shadow).not.toBeNull();
    expect(shadow).not.toBe("none");
    // And it is drawn from the title's own colour, not a neutral shadow.
    const glow = await tileFor(page, coloured)
      .locator(".poster-glow")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--glow").trim());
    expect(glow).toBe(glowFor("#1e3cdc"));
  });

  test(`a title with no colour never glows on ${surface}`, async ({ page }) => {
    await page.goto(surface);
    expect(await glowOnHover(page, tileFor(page, plain))).toBeNull();
  });
}

test.describe("on a device that cannot hover", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("a coloured poster carries no glow", async ({ page }) => {
    await page.goto("/library");
    const tile = tileFor(page, coloured);
    await tile.scrollIntoViewIfNeeded();
    const shadow = await tile
      .locator(".poster-glow")
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe("none");
  });
});
