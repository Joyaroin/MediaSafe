import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #530's browser property: Settings' *share my last watched title* row is off by
 * default, switching it on shows a link that answers with the reader's last watched title
 * and no session behind it, off makes the link 404, on again brings the same link back, and
 * *Make a new link* retires the old one.
 *
 * Its own fixture account, for `calendar-feed.spec.ts`'s reason: the route needs a dated
 * watch, and the shared account must stay empty. `seedWatchingShow` writes one.
 *
 * The link is fetched by **path** against this suite's own server, never by the URL's
 * origin: Settings writes the URL against `BETTER_AUTH_URL`, which is not this server.
 */

let showName: string;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  ({ titleName: showName } = await seedWatchingShow(session.userId));

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "last-watched-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "last-watched-session.json") });

const toggle = (page: Page) => page.getByRole("switch", { name: /Sharing is/ });

async function linkPath(page: Page): Promise<string> {
  const text = await page.getByTestId("last-watched-url").textContent();
  return new URL(text ?? "").pathname;
}

test("off by default; on, off, on again and a new link each do what the row says", async ({
  page,
  playwright,
  baseURL,
}) => {
  // A request context with no cookies at all: what the visitor's browser is.
  const app = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const ask = (p: string) => app.get(p, { maxRedirects: 0 });

  await page.goto("/settings");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("last-watched-url")).toHaveCount(0);

  await toggle(page).click();
  await expect(page.getByTestId("last-watched-url")).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  const first = await linkPath(page);

  const served = await ask(first);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("text/plain");
  expect(await served.text()).toBe(showName);

  await toggle(page).click();
  await expect(page.getByTestId("last-watched-url")).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  expect((await ask(first)).status()).toBe(404);

  // The off survives a reload: Settings reads it back off the session.
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");

  await toggle(page).click();
  await expect(page.getByTestId("last-watched-url")).toBeVisible();
  expect(await linkPath(page)).toBe(first);
  const again = await ask(first);
  expect(again.status()).toBe(200);
  expect(await again.text()).toBe(showName);

  await page.getByRole("button", { name: "Make a new link" }).click();
  await expect(page.getByText("New link made. The old one no longer works.")).toBeVisible();
  const second = await linkPath(page);
  expect(second).not.toBe(first);

  expect((await ask(first)).status()).toBe(404);
  const fresh = await ask(second);
  expect(fresh.status()).toBe(200);
  expect(await fresh.text()).toBe(showName);

  // On and the new link both survive a reload.
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  expect(await linkPath(page)).toBe(second);

  await app.dispose();
});
