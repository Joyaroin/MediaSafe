import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #373 in a real browser: a stopped show is on You's *Shows you stopped* rail, and
 * Start again takes it off and puts it back in Up next's Continue watching.
 *
 * The show is stopped directly in the fixture database (`abandoned_at` set), the state the
 * Give up action leaves — this spec is about the way back, not the way there.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  show = await seedWatchingShow(session.userId);

  const pool = createPool(requireDatabaseUrl());
  try {
    await drizzle(pool, { schema })
      .update(schema.libraryEntry)
      .set({ abandonedAt: new Date() })
      .where(eq(schema.libraryEntry.id, show.libraryEntryId));
  } finally {
    await pool.end();
  }

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "you-start-again-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "you-start-again-session.json") });

test("Start again takes a stopped show off You and back onto Continue watching", async ({ page }) => {
  await page.goto("/up-next");
  await expect(page.getByText(show.titleName)).toHaveCount(0);

  await page.goto("/you");
  const rail = page.locator("section", {
    has: page.getByRole("heading", { name: "Shows you stopped" }),
  });
  await expect(rail.getByText(show.titleName)).toBeVisible();

  // Waited on by its response, not by `networkidle`: on a page already loaded that returns
  // at once, and the reload would then cancel the write it was meant to wait for — the rail
  // leaves optimistically, before the write lands.
  const written = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await rail.getByRole("button", { name: `Start ${show.titleName} again` }).click();
  await expect(page.getByRole("heading", { name: "Shows you stopped" })).toHaveCount(0);

  // A fresh load proves it is the database saying so, not the optimistic state.
  await written;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shows you stopped" })).toHaveCount(0);

  await page.goto("/up-next");
  await expect(page.getByText(show.titleName).first()).toBeVisible();
});
