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
 * on :3000, not the build under test on :3100.
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

/**
 * Issue #601: keyboard focus while a link is being made. *Make a calendar link* is
 * unmounted when the first link lands, and focus goes to *Copy link*; *Make a new link*
 * keeps it through its write. Each write is held in the route so the test looks at the
 * in-flight state itself (`aria-disabled`, one POST seen) before it checks focus, and a
 * second press while one runs must start no second write.
 *
 * The fixture account is shared with the test above, which may have left a link: this one
 * starts by making sure there is none, which needs a fresh account, so it makes its own.
 */
test("focus follows the keyboard: Copy link after the first link, and Make a new link keeps it", async ({
  browser,
  baseURL,
}) => {
  const session = await seedFixtureSession();
  await seedWatchingShow(session.userId);
  const stateFile = path.join(__dirname, ".auth", "calendar-feed-focus-session.json");
  writeFileSync(stateFile, JSON.stringify(toStorageState(session), null, 2));
  const context = await browser.newContext({ baseURL, storageState: stateFile });
  const own = await context.newPage();

  let posts = 0;
  let gate!: Promise<void>;
  let release!: () => void;
  const hold = () => {
    gate = new Promise<void>((resolve) => (release = resolve));
  };
  await own.route("**/settings", async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) {
      return route.continue();
    }
    posts += 1;
    await gate;
    return route.continue();
  });

  await own.goto("/settings");
  const make = own.getByRole("button", { name: /^Make a calendar link$|^Making a link$/ });
  const copy = own.getByRole("button", { name: "Copy link" });
  const makeNew = own.getByRole("button", { name: /^Make a new link$|^Making a new link$/ });
  await expect(own.getByTestId("calendar-feed-url")).toHaveCount(0);

  hold();
  await make.focus();
  await own.keyboard.press("Enter");
  await expect(make).toHaveAttribute("aria-disabled", "true");
  await expect(make).toHaveText("Making a link");
  expect(posts).toBe(1);
  await expect(make).toBeFocused();
  await own.keyboard.press("Enter");
  release();
  await expect(own.getByTestId("calendar-feed-url")).toBeVisible();
  await expect(make).toHaveCount(0);
  await expect(copy).toBeFocused();
  expect(posts).toBe(1);

  hold();
  await makeNew.focus();
  await own.keyboard.press("Enter");
  await expect(makeNew).toHaveAttribute("aria-disabled", "true");
  await expect(makeNew).toHaveText("Making a new link");
  expect(posts).toBe(2);
  await expect(makeNew).toBeFocused();
  await own.keyboard.press("Space");
  release();
  await expect(own.getByText("New link made. The old one no longer works.")).toBeVisible();
  await expect(makeNew).toHaveText("Make a new link");
  await expect(makeNew).toBeFocused();
  expect(posts).toBe(2);

  await context.close();
});
