import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Search's buttons: announced by the words they show (issue #536), and one **Add** per
 * result followed by "Where are you up to?" (issue #550). This is the one Search spec.
 *
 * Every Search button's accessible name **begins with its visible label** (WCAG 2.5.3),
 * and **Add comes first** in DOM and tab order (WCAG 2.4.3). Once an add lands, a show
 * offers *Not started* (chosen) and *Seen it all* as radios and *Pick an episode* as a
 * button; a film offers a *Seen it* toggle.
 *
 * Search reaches the live catalogue, so, like `one-app.spec.ts`'s Search test, it skips
 * on a placeholder TMDB token rather than failing. Its own fixture account. The tests that
 * add use a **different query each**, because a title added by one is held — and offers no
 * chips — in the next.
 *
 * ── How the writes are proven rather than assumed ────────────────────────────────────
 *
 * Whether *Seen it all* then *Not started* leaves no watches is a question about the
 * database, so the tests count `watch` rows for the account. A count of zero at the end
 * proves nothing alone — it is also what an add with no *Seen it all* leaves — so each of
 * those tests first shows the watches **were** there: the film test polls for one before
 * toggling off, and the quick-presses test counts them at the moment the *Seen it all*
 * write lands, from inside the request handler, before the page has been told.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

test.skip(
  (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-"),
  "needs a real TMDB_READ_ACCESS_TOKEN",
);

let userId: string;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  userId = session.userId;
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

/** The first result of a kind, whatever TMDB ranks first for the query. */
function firstRow(page: Page, kind: "show" | "film"): Locator {
  return page.locator(`section[aria-labelledby="search-${kind}-h"] ol > li`).first();
}

async function titleOf(row: Locator): Promise<string> {
  return (await row.getByRole("heading", { level: 3 }).innerText()).trim();
}

async function watchCount(): Promise<number> {
  const pool = createPool(requireDatabaseUrl());
  try {
    const db = drizzle(pool, { schema });
    const [row] = await db
      .select({ n: count() })
      .from(schema.watch)
      .where(eq(schema.watch.userId, userId));
    return row.n;
  } finally {
    await pool.end();
  }
}

/** True for the Server Action POSTs the page makes, as opposed to its navigations. */
const isAction = (route: Route) =>
  route.request().method() === "POST" && Boolean(route.request().headers()["next-action"]);

/**
 * Hold the add's answer until `release()` is called. The server has done the write by then
 * (the request is fetched first), so what is held is only the page being told: the row stays
 * in its *adding* phase for as long as a test needs to look at it.
 */
async function holdAdd(page: Page): Promise<{ release(): void }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/search", async (route) => {
    if (!isAction(route)) return route.fallback();
    const real = await route.fetch();
    await gate;
    return route.fulfill({ response: real });
  });
  return { release };
}

/** Add the first result of a kind and wait for its follow-up to arrive. */
async function addFirst(page: Page, kind: "show" | "film") {
  const row = firstRow(page, kind);
  const title = await titleOf(row);
  await row.getByRole("button", { name: /^Add/ }).click();
  // The optimistic row first, then the follow-up when the add has landed.
  await expect(row.getByText("In your library")).toBeVisible();
  return { row, title };
}

for (const viewport of [
  { label: "phone", size: PHONE },
  { label: "desktop", size: DESKTOP },
]) {
  test(`every result has one Add, found by its visible label, on a ${viewport.label}`, async ({
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
      if ((await row.getByText(/· Show$/).count()) === 1) shows += 1;
      else films += 1;

      const title = await titleOf(row);

      const add = row.getByRole("button", { name: /^Add/ });
      await expect(add).toHaveCount(1);
      await expect(add).toHaveText("Add");
      await expect(add).toHaveAccessibleName(new RegExp(`^Add ${escapeRegExp(title)}`));

      // One button on the row, before the add: the seen-it button is gone (issue #550).
      expect(
        await row.getByRole("button").evaluateAll((buttons) =>
          buttons.map((b) => (b.textContent ?? "").trim()),
        ),
      ).toEqual(["Add"]);
      await expect(row.getByRole("button", { name: /^(I've )?[Ss]een it/ })).toHaveCount(0);
    }

    expect(shows).toBeGreaterThan(0);
    expect(films).toBeGreaterThan(0);
  });
}

test("Add is first in tab order on a result", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const rows = await searchFor(page, "Severance");
  const row = rows.first();

  // Start on the title's link, so the Tab below is the row's own.
  await row.getByRole("link").first().focus();
  await page.keyboard.press("Tab");
  await expect(row.getByRole("button", { name: /^Add/ })).toBeFocused();
});

for (const viewport of [
  { label: "phone", size: PHONE, query: "Severance" },
  { label: "desktop", size: DESKTOP, query: "Breaking Bad" },
]) {
  test(`after Add, a show offers the three chips and a film offers Seen it, on a ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport.size);
    await searchFor(page, viewport.query);

    // ── A show ──
    const { row: show, title } = await addFirst(page, "show");
    const group = show.getByRole("radiogroup", { name: "Where are you up to?" });
    await expect(group).toBeVisible();

    const notStarted = show.getByRole("radio", { name: /^Not started/ });
    const seenAll = show.getByRole("radio", { name: /^Seen it all/ });
    const pick = show.getByRole("button", { name: /^Pick an episode/ });
    await expect(notStarted).toHaveAccessibleName(`Not started: ${title}`);
    await expect(seenAll).toHaveAccessibleName(`Seen it all: ${title}, every aired episode`);
    await expect(pick).toHaveAccessibleName(`Pick an episode: ${title}`);
    await expect(notStarted).toHaveText("Not started");
    await expect(seenAll).toHaveText("Seen it all");
    await expect(pick).toHaveText("Pick an episode");
    await expect(notStarted).toHaveAttribute("aria-checked", "true");
    await expect(seenAll).toHaveAttribute("aria-checked", "false");
    // The Add button is gone, and the row's DOM order is the reader's order.
    await expect(show.getByRole("button", { name: /^Add/ })).toHaveCount(0);

    // Arrow keys move the radio group's choice and focus.
    await notStarted.focus();
    await page.keyboard.press("ArrowRight");
    await expect(seenAll).toBeFocused();
    await expect(seenAll).toHaveAttribute("aria-checked", "true");
    await expect(notStarted).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(notStarted).toBeFocused();
    await expect(notStarted).toHaveAttribute("aria-checked", "true");

    // ── A film ──
    const { row: film, title: filmTitle } = await addFirst(page, "film");
    const seenIt = film.getByRole("button", { name: /^Seen it/ });
    await expect(seenIt).toHaveAccessibleName(`Seen it: ${filmTitle}`);
    await expect(seenIt).toHaveText("Seen it");
    await expect(seenIt).toHaveAttribute("aria-pressed", "false");
    await expect(film.getByRole("radiogroup")).toHaveCount(0);

    // ── A new query clears them ──
    await page.getByLabel("Search films and shows").fill("Arrival");
    await expect(page.getByRole("heading", { name: "Films", level: 2 })).toBeVisible();
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByText("Where are you up to?")).toHaveCount(0);
  });
}

test("Seen it all then Not started, pressed quickly, leaves no watches", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await searchFor(page, "Fargo");
  const { row } = await addFirst(page, "show");
  await expect(row.getByRole("radiogroup")).toBeVisible();

  const events: string[] = [];
  let watchesWhenSeenAllLanded = -1;
  let actions = 0;

  // The two actions after the add's own answer — Seen it all, then the take-back. The
  // first is held back after it has landed, so the *Not started* press is made while it
  // is still in flight. (Next.js already sends Server Actions one at a time, so this does
  // not pin the row's own queue — `tests/search-row-writes.test.ts` does. It pins the
  // outcome through the real app: the watches were there, and are gone.)
  await page.route("**/search", async (route) => {
    if (!isAction(route)) return route.fallback();
    const which = ++actions;

    if (which === 1) {
      const real = await route.fetch();
      watchesWhenSeenAllLanded = await watchCount();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      events.push("seen-all answered");
      return route.fulfill({ response: real });
    }

    events.push("take-back sent");
    return route.continue();
  });

  await row.getByRole("radio", { name: /^Seen it all/ }).click();
  await row.getByRole("radio", { name: /^Not started/ }).click();

  await expect(row.getByRole("radio", { name: /^Not started/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => events).toEqual(["seen-all answered", "take-back sent"]);

  // The setup: the watches existed when the write landed, so zero at the end is the take-back.
  expect(watchesWhenSeenAllLanded).toBeGreaterThan(0);
  await expect.poll(watchCount).toBe(0);
});

test("the Seen it toggle on, then off, leaves no watch on the film", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await searchFor(page, "Arrival");
  const { row } = await addFirst(page, "film");
  const seenIt = row.getByRole("button", { name: /^Seen it/ });

  await seenIt.click();
  await expect(seenIt).toHaveAttribute("aria-pressed", "true");
  // The setup: the film really was recorded before it is taken back.
  await expect.poll(watchCount).toBe(1);

  await seenIt.click();
  await expect(seenIt).toHaveAttribute("aria-pressed", "false");
  await expect.poll(watchCount).toBe(0);
});

test("Pick an episode takes Seen it all back, then opens the title at its episodes", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await searchFor(page, "Dark");
  const { row } = await addFirst(page, "show");

  await row.getByRole("radio", { name: /^Seen it all/ }).click();
  await expect.poll(watchCount).toBeGreaterThan(0);

  await row.getByRole("button", { name: /^Pick an episode/ }).click();
  await page.waitForURL(/\/titles\/[0-9a-f-]+\?from=search#episodes$/);

  // The navigation waited for the take-back: nothing is left recorded.
  expect(await watchCount()).toBe(0);
  await expect(page.getByText("Tick the last episode you've seen, then use Also mark earlier.")).toBeVisible();
});

test("a lost Seen it all raises one toast; Try again lands it and takes the toast down", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await searchFor(page, "Mindhunter");
  const { row, title } = await addFirst(page, "show");
  await expect(row.getByRole("radiogroup")).toBeVisible();

  const dropActions = (route: Route) => (isAction(route) ? route.abort() : route.fallback());
  await page.route("**/search", dropActions);

  const notStarted = row.getByRole("radio", { name: /^Not started/ });
  const seenAll = row.getByRole("radio", { name: /^Seen it all/ });
  await seenAll.click();

  const toast = page.getByRole("alert").filter({ hasText: "That did not save" });
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(title);
  // Put back: the write was lost, so the row says so.
  await expect(notStarted).toHaveAttribute("aria-checked", "true");
  expect(await watchCount()).toBe(0);

  await page.unroute("**/search", dropActions);
  await toast.getByRole("button", { name: "Try again" }).click();

  await expect(seenAll).toHaveAttribute("aria-checked", "true");
  await expect(toast).toHaveCount(0);
  await expect.poll(watchCount).toBeGreaterThan(0);
});

// ── Focus through an add — issue #604 ──────────────────────────────────────────────────
//
// Add is unmounted by its own press, so focus used to drop to the top of the page. Every
// test here presses Add with the keyboard, and each proves its own setup: the row really
// was in the phase the assertion names (held back with `holdAdd`, or the write dropped and
// its toast raised) before the focus is read.

test("after Add on a show, focus is on In your library while adding, then on Not started", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await searchFor(page, "Succession");
  const row = firstRow(page, "show");
  const title = await titleOf(row);
  const held = await holdAdd(page);

  await row.getByRole("button", { name: /^Add/ }).focus();
  await page.keyboard.press("Enter");

  // Adding: the link has replaced Add, and the chips are not there yet — so this is the
  // adding phase, not the added one.
  const library = row.getByRole("link", { name: `${title} is in your library — open it` });
  await expect(library).toBeFocused();
  await expect(row.getByRole("radiogroup")).toHaveCount(0);

  held.release();
  const notStarted = row.getByRole("radio", { name: /^Not started/ });
  await expect(notStarted).toHaveAttribute("aria-checked", "true");
  await expect(notStarted).toBeFocused();
});

test("after Add on a film, focus is on the Seen it toggle once the add lands", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await searchFor(page, "Inception");
  const row = firstRow(page, "film");
  const held = await holdAdd(page);

  await row.getByRole("button", { name: /^Add/ }).focus();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("link", { name: /is in your library/ })).toBeFocused();

  held.release();
  const seenIt = row.getByRole("button", { name: /^Seen it/ });
  // Unpressed: it starts as the answer to "have you seen it?", which is no.
  await expect(seenIt).toHaveAttribute("aria-pressed", "false");
  await expect(seenIt).toBeFocused();
});

test("a lost add puts focus back on Add", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await searchFor(page, "Ozark");
  const row = firstRow(page, "show");
  const title = await titleOf(row);

  await page.route("**/search", (route) => (isAction(route) ? route.abort() : route.fallback()));
  const add = row.getByRole("button", { name: /^Add/ });
  await add.focus();
  await page.keyboard.press("Enter");

  // The setup: the write was lost — its toast is up and the row offers Add again.
  const toast = page.getByRole("alert").filter({ hasText: "That did not save" });
  await expect(toast).toContainText(title);
  await expect(add).toBeVisible();
  await expect(add).toBeFocused();
});

test("focus the reader moved elsewhere mid-add is not taken back", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await searchFor(page, "Chernobyl");
  const row = firstRow(page, "show");
  const held = await holdAdd(page);
  const box = page.getByLabel("Search films and shows");

  await row.getByRole("button", { name: /^Add/ }).focus();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("link", { name: /is in your library/ })).toBeFocused();

  // The reader moves on while the add is in flight.
  await box.focus();
  held.release();

  // The setup: the add did land, and the chips are there.
  await expect(row.getByRole("radio", { name: /^Not started/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(box).toBeFocused();
});
