import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #366's browser property: the link Settings hands out is a working calendar with no
 * session behind it, and *Make a new link* kills the old one.
 *
 * Its own fixture account, for `up-next-restart.spec.ts`'s reason — the feed needs a show in
 * the library, and the shared account must stay empty.
 *
 * The feed is fetched by **path** against this suite's own server, never by the URL's
 * origin: Settings writes the URL against `BETTER_AUTH_URL`, which locally is the dev server
 * on :3000, not the build under test on `E2E_PORT` (3100 unless set).
 */

let showName: string;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  ({ titleName: showName } = await seedWatchingShow(session.userId));

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "calendar-feed-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "calendar-feed-session.json") });

async function feedPath(page: Page): Promise<string> {
  const text = await page.getByTestId("calendar-feed-url").textContent();
  return new URL(text ?? "").pathname;
}

test("the feed serves ICS without a session, and a new link kills the old one", async ({
  page,
  playwright,
  baseURL,
}) => {
  // A request context with no cookies at all — which is what a calendar app is.
  const app = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Make a calendar link" }).click();
  await expect(page.getByTestId("calendar-feed-url")).toBeVisible();
  const first = await feedPath(page);

  const served = await app.get(first, { maxRedirects: 0 });
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("text/calendar");
  const body = await served.text();
  expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(body.replace(/\r\n /g, "")).toContain(`SUMMARY:${showName} — S01 · E02`);

  await page.getByRole("button", { name: "Make a new link" }).click();
  await expect(page.getByText("New link made. The old one no longer works.")).toBeVisible();
  const second = await feedPath(page);
  expect(second).not.toBe(first);

  expect((await app.get(first, { maxRedirects: 0 })).status()).toBe(404);
  expect((await app.get(second, { maxRedirects: 0 })).status()).toBe(200);

  // And the link survives a reload: Settings reads the token back off the session.
  await page.reload();
  expect(await feedPath(page)).toBe(second);

  await app.dispose();
});
