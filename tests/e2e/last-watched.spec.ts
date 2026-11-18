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

/**
 * ── The row's three writes, when one is slow or lost ─────────────────────────────────
 *
 * The row has three writes — on, off, a new link — and they must not borrow each other's
 * state: the *Making a new link* label belongs to a new link alone, and a lost write's
 * toast is neither cleared nor suppressed by a different write.
 *
 * A Server Action is a POST carrying a `Next-Action` header, so these tests learn each
 * action's id by performing it once for real (`learnActions`), and then hold or abort that
 * id by name. An aborted request rejects in the browser, which is the control's failure
 * path (`referenceFor` on the rejection), the same toast a failed write raises.
 */
type Action = "on" | "off" | "renew";

const toast = (page: Page, title: string) =>
  page.getByRole("alert").filter({ has: page.getByText(title, { exact: true }) });

/** Clicks, and returns the id of the Server Action that click posted. */
async function postedBy(page: Page, click: () => Promise<void>): Promise<string> {
  const [request] = await Promise.all([
    page.waitForRequest(
      (candidate) => candidate.method() === "POST" && !!candidate.headers()["next-action"],
    ),
    click(),
  ]);
  return request.headers()["next-action"];
}

/**
 * Puts sharing on and returns the id each action posts under.
 *
 * Each id is read off the request its own click sends, never by position: the fixture
 * user is shared by every test in this file, so sharing may start on or off, and a list of
 * ids in arrival order would label them one place out whenever it starts on.
 */
async function learnActions(page: Page): Promise<Record<Action, string>> {
  await page.goto("/settings");
  if ((await toggle(page).getAttribute("aria-checked")) === "true") {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  }

  const on = await postedBy(page, () => toggle(page).click());
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  const renew = await postedBy(page, () =>
    page.getByRole("button", { name: "Make a new link" }).click(),
  );
  await expect(page.getByText("New link made. The old one no longer works.")).toBeVisible();
  const off = await postedBy(page, () => toggle(page).click());
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");

  // Leave sharing on, as every test below starts.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");

  expect(new Set([on, renew, off]).size).toBe(3);
  return { on, off, renew };
}

type Plan = (action: Action) => "pass" | "fail" | Promise<"pass" | "fail">;

/** Decides each action's fate when it is posted: let it through, or lose it. */
async function steer(page: Page, ids: Record<Action, string>, plan: Plan): Promise<void> {
  await page.route("**/settings", async (route) => {
    const id = route.request().headers()["next-action"];
    const action = (Object.keys(ids) as Action[]).find((name) => ids[name] === id);
    if (route.request().method() !== "POST" || !action) return route.continue();
    return (await plan(action)) === "fail" ? route.abort("failed") : route.continue();
  });
}

test("a new link is only called 'Making a new link' while a new link is being made", async ({
  page,
}) => {
  const ids = await learnActions(page);

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let offHeld = false;
  await steer(page, ids, async (action) => {
    if (action === "off") {
      offHeld = true;
      await held;
    }
    return "pass" as const;
  });

  const makeNew = page.getByRole("button", { name: /^Make a new link$|^Making a new link$/ });
  await toggle(page).click();

  // The off is in flight, held in the route: without this the label below could be read
  // after an off that was never held, and pass for the wrong reason.
  await expect.poll(() => offHeld).toBe(true);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(makeNew).toBeDisabled();
  await expect(makeNew).toHaveText("Make a new link");
  // Exact: the row's help paragraph says "Making a new link stops the old one…".
  await expect(page.getByText("Making a new link", { exact: true })).toHaveCount(0);

  release();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
});

test("a failed new link keeps its toast when a later off lands", async ({ page }) => {
  const ids = await learnActions(page);
  await steer(page, ids, (action) => (action === "renew" ? "fail" : "pass"));

  await page.getByRole("button", { name: "Make a new link" }).click();
  await expect(toast(page, "New last watched link")).toBeVisible();

  // The off lands. It says nothing about the link that was never replaced.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(toast(page, "New last watched link")).toBeVisible();

  // Trying again once the row is off replaces the link behind the scenes, clears the toast
  // and leaves the row off: the retry must not switch sharing back on.
  await page.unroute("**/settings");
  await toast(page, "New last watched link").getByRole("button", { name: "Try again" }).click();
  await expect(toast(page, "New last watched link")).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("last-watched-url")).toHaveCount(0);
});

test("a failed new link after a failed off raises its own toast, whose retry is the new link", async ({
  page,
}) => {
  const ids = await learnActions(page);
  await steer(page, ids, () => "fail");

  await toggle(page).click();
  await expect(toast(page, "Last watched link")).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  const before = await linkPath(page);

  await page.getByRole("button", { name: "Make a new link" }).click();
  await expect(toast(page, "New last watched link")).toBeVisible();

  await page.unroute("**/settings");
  await toast(page, "New last watched link").getByRole("button", { name: "Try again" }).click();
  await expect(toast(page, "New last watched link")).toHaveCount(0);
  await expect(page.getByText("New link made. The old one no longer works.")).toBeVisible();
  expect(await linkPath(page)).not.toBe(before);

  // The retry made a link; it did not turn sharing off. The off's own toast still stands.
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(toast(page, "Last watched link")).toBeVisible();
});
