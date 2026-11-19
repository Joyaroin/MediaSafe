import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #549 — the Lists empty state in plain words. Its own fixture account, because the
 * property is "an account with no lists" and `one-app.spec.ts`'s account makes lists.
 */

test.beforeAll(async () => {
  const session = await seedFixtureSession();

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "lists-empty-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "lists-empty-session.json"),
});

for (const [name, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 900 }],
] as const) {
  test(`an account with no lists is told what a list is for, on a ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/library?view=lists");

    await expect(
      page.getByRole("heading", { name: "Make your own groups", level: 2 }),
    ).toBeVisible();
    // Checked in a browser at 390 and 1280 wide (#599): `/library?view=lists` renders this
    // sentence once, in one visible element, with no hidden copy. The `visible: true` filter
    // is kept anyway, so a hidden duplicate added later is not what this assertion counts.
    await expect(
      page
        .getByText(
          "Comfort shows, watch with Dad, the ones you keep meaning to start. Name a list above, then add titles from any title page with List.",
        )
        .filter({ visible: true }),
    ).toHaveCount(1);
    // The old copy is gone.
    await expect(page.getByText("The five states are derived")).toHaveCount(0);
  });
}
