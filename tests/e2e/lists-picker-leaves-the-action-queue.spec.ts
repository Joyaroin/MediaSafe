import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { HOLD_MS } from "@/app/(signed-in)/library/use-hold-to-select";
import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #481 — the two acceptance criteria a read-only review of the diff cannot pin, for
 * *both* call sites the ticket moves off the Server Action queue, mirroring
 * `search-leaves-the-action-queue.spec.ts` (#480):
 *
 *  - The add-to-list control's and the bulk selection bar's picker each answer while a
 *    watch mark is still saving, because each reads `GET /api/lists/picker` through
 *    `readRoute` instead of a Server Action, so neither ever queues behind one Next is
 *    still dispatching.
 *  - An expired session sends the reader to `/sign-in`, never drawn as a read failure; a
 *    genuine failure still shows the existing inline failure with its reference.
 *
 * Every assertion below goes through `**\/api/lists/picker**` route interception rather
 * than the live picker read, so it also pins the call site itself for both controls: if
 * either ever went back to a Server Action, no request would ever match that pattern and
 * the write-in-flight tests would time out rather than pass by accident.
 */

let markableForControl: SeededTitle;
let anyTitleForControl: SeededTitle;
let bulkWriteMark: SeededTitle;
let bulkSelectTitle: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // One episode already watched, one not — the next mark needs no "also mark earlier"
  // dialog, so a single click is the whole write (`up-next-motion.spec.ts`'s own shape).
  markableForControl = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });
  // Reused across the signed-out and genuine-failure tests below: neither mutates
  // anything, so one seeded title answers both.
  anyTitleForControl = await seedShowWithSeason(session.userId, { episodes: 1, watched: [] });
  bulkWriteMark = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });
  // Zero watched episodes keeps this off Tonight entirely (it never reaches "watching"),
  // so selecting it in Library can never collide with the mark fired at `bulkWriteMark`.
  bulkSelectTitle = await seedShowWithSeason(session.userId, { episodes: 1, watched: [] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "lists-picker-leaves-the-action-queue-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "lists-picker-leaves-the-action-queue-session.json"),
});

const markEpisode = (show: SeededTitle, episode: number) =>
  `Mark ${show.titleName}, Season 1, Episode ${episode} — Fixture Episode ${episode}, watched`;

/** The title page's own mark button carries no title name — `title-actions.tsx`'s
 *  `fullName`, the same format `title-count-roll.spec.ts`'s `markButton` pins. */
const titlePageMarkLabel = (episode: number) =>
  `Mark Season 1, Episode ${episode} — Fixture Episode ${episode} watched`;

/** Holds every Server Action's own `POST` open for `delayMs`, and nothing else — the same
 *  header-based match `up-next-motion.spec.ts` and #480's own spec use to find one
 *  without touching a URL. */
async function delayServerActions(page: Page, delayMs: number): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

function mockPicker(name: string) {
  return { ok: true, lists: [{ id: "mock-list-1", name, titleCount: 0 }] };
}

async function mockPickerRoute(page: Page, name: string): Promise<void> {
  await page.route("**/api/lists/picker**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPicker(name)),
    }),
  );
}

/** A held press — `use-hold-to-select.ts`'s gesture lands on the finger staying down for
 *  `HOLD_MS`, not on release — the same mechanism `selection-swap.spec.ts` drives. */
async function holdToSelect(page: Page, title: SeededTitle): Promise<void> {
  const cell = page.getByRole("main").getByRole("button", { name: new RegExp(title.titleName) });
  await expect(cell).toBeVisible();
  await page.waitForLoadState("networkidle");
  const box = await cell.boundingBox();
  expect(box, `no bounding box for the seeded cell "${title.titleName}"`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS + 150);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("the add-to-list dialog loads lists while a watch mark is still saving", async ({ page }) => {
  // Comfortably longer than the picker read has any business taking, so a row landing
  // inside the assertion's own timeout below is proof it skipped the queue rather than a
  // race against CI's variance.
  await delayServerActions(page, 2500);
  await mockPickerRoute(page, "E2E Mock List While A Mark Is Saving");

  await page.goto(`/titles/${markableForControl.libraryEntryId}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: markableForControl.titleName }),
  ).toBeVisible();

  // Fired, not awaited: the write is still on the wire, held by `delayServerActions`, for
  // the rest of this test.
  await main.getByRole("button", { name: titlePageMarkLabel(2), exact: true }).first().click();

  await main
    .getByRole("button", { name: `Add ${markableForControl.titleName} to a list`, exact: true })
    .click();

  await expect(
    page.getByRole("dialog").getByText("E2E Mock List While A Mark Is Saving"),
  ).toBeVisible({ timeout: 1500 });
});

test("the bulk selection bar's picker loads lists while a watch mark is still saving", async ({
  page,
  context,
}) => {
  // The write lives on its own tab, in the same signed-in browser context, so that this
  // page's own `waitForLoadState("networkidle")` below (needed to let
  // `selectable-entry.tsx` hydrate before the hold) never waits on the held write itself —
  // `holdToSelect` has no way to tell a request this test is deliberately keeping open
  // apart from any other in-flight network activity.
  const writer = await context.newPage();
  await delayServerActions(writer, 2500);
  await writer.goto("/up-next");
  await expect(writer.getByRole("main")).toBeVisible();

  // Fired, not awaited: the write is still on the wire, held by `delayServerActions`, for
  // the rest of this test — on the other tab, while this one reads the picker.
  await writer.getByRole("main").getByRole("button", { name: markEpisode(bulkWriteMark, 2) }).click();

  await mockPickerRoute(page, "E2E Mock List, Bulk, While A Mark Is Saving");
  await page.goto("/library");

  await holdToSelect(page, bulkSelectTitle);
  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();

  await page.getByRole("button", { name: "Add to list", exact: true }).click();

  await expect(
    page.getByRole("dialog").getByText("E2E Mock List, Bulk, While A Mark Is Saving"),
  ).toBeVisible({ timeout: 1500 });

  await writer.close();
});

test("an expired session sends the add-to-list dialog's reader to /sign-in, never a read failure", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`/titles/${anyTitleForControl.libraryEntryId}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: anyTitleForControl.titleName }),
  ).toBeVisible();

  // The real expiry, not a mocked 401 against a still-valid session: clearing the cookie
  // is what a signed-in `/sign-in` page's own guard would otherwise undo by redirecting
  // straight back, the way it does for a reader who is genuinely still signed in.
  await page.context().clearCookies();

  await main
    .getByRole("button", { name: `Add ${anyTitleForControl.titleName} to a list`, exact: true })
    .click();

  await page.waitForURL("**/sign-in");

  await expect(page.getByRole("heading", { name: "This did not load", exact: true })).toHaveCount(0);
  expect(
    pageErrors,
    "readLists()'s null branch (SignedOutError → null) was not taken cleanly — see " +
      "add-to-list-control.tsx's `if (outcome === null) return;`",
  ).toEqual([]);
});

test("a genuine read failure in the add-to-list dialog shows the inline failure, with Try again", async ({
  page,
}) => {
  await page.route("**/api/lists/picker**", (route) => route.abort("failed"));

  await page.goto(`/titles/${anyTitleForControl.libraryEntryId}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: anyTitleForControl.titleName }),
  ).toBeVisible();

  await main
    .getByRole("button", { name: `Add ${anyTitleForControl.titleName} to a list`, exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This did not load", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(dialog.getByText(/Name a list above/)).toHaveCount(0);
});

test("an expired session sends the bulk picker's reader to /sign-in, never a read failure", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/library");
  await holdToSelect(page, bulkSelectTitle);
  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();

  // The real expiry, not a mocked 401 against a still-valid session — see the add-to-list
  // dialog's own identical test for why.
  await page.context().clearCookies();

  await page.getByRole("button", { name: "Add to list", exact: true }).click();

  await page.waitForURL("**/sign-in");

  await expect(page.getByRole("heading", { name: "This did not load", exact: true })).toHaveCount(0);
  expect(
    pageErrors,
    "readLists()'s null branch (SignedOutError → null) was not taken cleanly — see " +
      "selection-action-bar.tsx's `if (outcome === null) return;`",
  ).toEqual([]);
});

test("a genuine read failure in the bulk picker shows the inline failure, with Try again", async ({
  page,
}) => {
  await page.goto("/library");
  await holdToSelect(page, bulkSelectTitle);
  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();

  await page.route("**/api/lists/picker**", (route) => route.abort("failed"));

  await page.getByRole("button", { name: "Add to list", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This did not load", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(dialog.getByText(/You have no lists yet/)).toHaveCount(0);
});
