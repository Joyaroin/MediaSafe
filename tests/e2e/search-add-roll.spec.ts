import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #477 — Search's add confirmation rolls in.
 *
 * `tests/search-add-roll.test.ts` holds the static shape (one `Roll`, keyed on
 * `inLibrary`, with the second pill's slot reserved unconditionally). This plays the
 * moment: the row's height before, mid-roll and settled, the pills coming back after a
 * lost write, and that *In your library* still opens the same page.
 *
 * `/api/search` is mocked rather than read from the live catalogue (`search-leaves-the
 * -action-queue.spec.ts`'s own reasoning): this ticket is about the row's own motion, not
 * about what TMDB answers, and a mocked response makes the row's name and id exact and
 * repeatable. The add itself is a real Server Action against this file's own fixture
 * account, held open or aborted on the wire rather than faked, since Next's own RSC action
 * reply is not a shape worth reproducing by hand.
 *
 * `--dur-roll` is stretched for the first test only, so the mid-roll sample in the middle
 * of this test is not a race against the real 280ms (`up-next-motion.spec.ts`'s own
 * stretch of a short, unpollable moment).
 */

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "search-add-roll-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "search-add-roll-session.json"),
});

function mockFilm(name: string, tmdbId: number) {
  return {
    show: { ok: true, results: [] },
    film: {
      ok: true,
      results: [
        {
          kind: "film",
          tmdbId,
          name,
          releaseYear: 1999,
          posterPath: null,
          audienceScore: null,
          inLibrary: false,
        },
      ],
    },
  };
}

async function mockSearch(page: Page, name: string, tmdbId: number): Promise<void> {
  await page.route("**/api/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockFilm(name, tmdbId)),
    }),
  );
}

/** Holds every Server Action's own `POST` open forever — the add is optimistic, so the
 *  row settles into *In your library* without the write ever landing, which is exactly
 *  the state this test needs to measure. */
async function holdServerActions(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await new Promise(() => {
        // Never resolves — the write stays in flight for the rest of this test.
      });
      return;
    }
    await route.continue();
  });
}

/** Fails every Server Action's own `POST` at once, as `up-next-motion.spec.ts` does for
 *  the same reason: offline looks exactly like this on the wire. */
async function failServerActions(page: Page): Promise<void> {
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] !== undefined
      ? route.abort()
      : route.continue(),
  );
}

async function openSearchFor(page: Page, name: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/search");
  await page.getByRole("main").getByLabel("Search films and shows").fill(name);
}

test("a successful add rolls the pills into In your library, and the row's height never moves", async ({
  page,
}) => {
  const name = `E2E Roll Fixture Film ${Date.now()}`;
  await holdServerActions(page);
  await mockSearch(page, name, 900_000_001);
  await openSearchFor(page, name);

  const main = page.getByRole("main");
  const row = main.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Stretched well past the real 280ms, so the mid-roll sample below is not a race.
  await page.addStyleTag({ content: ":root { --dur-roll: 2000ms; }" });

  const add = row.getByRole("button", { name: `Add ${name} to your library`, exact: true });
  const addWatched = row.getByRole("button", {
    name: `Add ${name} to your library as watched`,
  });
  await expect(add).toBeVisible();
  await expect(addWatched).toBeVisible();

  const heightBefore = await row.evaluate((element) => element.getBoundingClientRect().height);

  await add.click();

  // Mid-roll: the leaving snapshot (both pills) and the entering one (the reserved slot
  // plus the link) are both on screen, in the same slot, and the row has not moved.
  await expect(row.locator(".roll-out")).toHaveCount(1);
  const heightMidRoll = await row.evaluate((element) => element.getBoundingClientRect().height);
  expect(heightMidRoll).toBe(heightBefore);

  // Settled: the leaving snapshot is gone, In your library is what rolled in, and the
  // row's height is exactly what it was before the press — not shorter, because the
  // second pill's slot stays reserved rather than collapsing with it.
  await expect(row.locator(".roll-out")).toHaveCount(0, { timeout: 5_000 });
  const openTitle = row.getByRole("link", { name: `${name} is in your library — open it` });
  await expect(openTitle).toBeVisible();
  await expect(add).toHaveCount(0);
  await expect(addWatched).toHaveCount(0);

  const heightAfter = await row.evaluate((element) => element.getBoundingClientRect().height);
  expect(heightAfter).toBe(heightBefore);

  // Still the same link it always was: the catalogue address, not a dead end.
  expect(await openTitle.getAttribute("href")).toBe("/catalogue/film/900000001");
});

test("a lost add raises the write-failure toast once, and the pills come back", async ({
  page,
}) => {
  const name = `E2E Lost Roll Fixture Film ${Date.now()}`;
  await failServerActions(page);
  await mockSearch(page, name, 900_000_002);
  await openSearchFor(page, name);

  const main = page.getByRole("main");
  const row = main.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const add = row.getByRole("button", { name: `Add ${name} to your library`, exact: true });
  const addWatched = row.getByRole("button", {
    name: `Add ${name} to your library as watched`,
  });
  await add.click();

  // The write was lost: the toast says so, naming the title, and the pills are back on
  // the row rather than leaving it saying something that never happened.
  const toast = page.getByRole("alert").filter({ hasText: "That did not save" });
  await expect(toast).toBeVisible();
  await expect(toast.getByText(name, { exact: true })).toBeVisible();

  await expect(add).toBeVisible();
  await expect(addWatched).toBeVisible();
  await expect(row.getByRole("link", { name: `${name} is in your library — open it` })).toHaveCount(
    0,
  );

  // One toast, not one per press — scoped to the write-failure toast's own content, since
  // `page.getByRole("alert")` alone also matches Next's own, always-empty
  // `__next-route-announcer__`, which carries the same role for its own unrelated reason.
  await expect(toast).toHaveCount(1);
});

test.describe("under reduced motion", () => {
  test("the change is a fade on --dur-roll rather than a cut", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    const name = `E2E Reduced Roll Fixture Film ${Date.now()}`;
    await holdServerActions(page);
    await mockSearch(page, name, 900_000_003);
    await openSearchFor(page, name);

    const main = page.getByRole("main");
    const row = main.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const add = row.getByRole("button", { name: `Add ${name} to your library`, exact: true });
    await add.click();

    const openTitle = row.getByRole("link", { name: `${name} is in your library — open it` });
    await expect(openTitle).toBeVisible();

    const rollIn = row.locator(".roll-in").filter({ hasText: "In your library" });
    await expect(rollIn).toHaveCount(1);
    expect(await rollIn.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "roll-in",
    );
    expect(
      await rollIn.evaluate((element) => getComputedStyle(element).animationDuration),
    ).toBe("0.28s");
    // A fade, never a cut: travel is gone, the fade is not.
    expect(await rollIn.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  });
});
