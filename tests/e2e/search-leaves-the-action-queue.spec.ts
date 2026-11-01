import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #480 — the two acceptance criteria a read-only review of the diff cannot pin,
 * because both are about *when* a request answers relative to another one on the wire,
 * which only a real browser and real network timing can show:
 *
 *  - Searching while a watch mark is in flight returns results without waiting for the
 *    write — `search-surface.tsx` fetches `GET /api/search` through `readRoute` instead
 *    of a Server Action, so it never queues behind one Next is still dispatching.
 *  - A superseded query is aborted and never drawn as a failure; a real failure still
 *    shows the inline failure with its reference.
 *
 * Every assertion below goes through `**\/api/search**` route interception rather than the
 * live TMDB catalogue, so it also pins the call site itself: if Search ever went back to a
 * Server Action, no request would ever match that pattern and every test here would time
 * out rather than pass by accident.
 */

let markable: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // One episode already watched, one not — the next mark needs no "also mark earlier"
  // dialog, so a single click is the whole write (`up-next-motion.spec.ts`'s own shape).
  markable = await seedShowWithSeason(session.userId, { episodes: 2, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "search-leaves-the-action-queue-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({
  storageState: path.join(__dirname, ".auth", "search-leaves-the-action-queue-session.json"),
});

const markEpisode = (show: SeededTitle, episode: number) =>
  `Mark ${show.titleName}, Season 1, Episode ${episode} — Fixture Episode ${episode}, watched`;

function mockBothKinds(name: string) {
  return {
    show: {
      ok: true,
      results: [
        {
          kind: "show",
          tmdbId: Math.floor(Math.random() * 900_000_000) + 1,
          name,
          releaseYear: 2023,
          posterPath: null,
          audienceScore: null,
          inLibrary: false,
        },
      ],
    },
    film: { ok: true, results: [] },
  };
}

/** Holds every Server Action's own `POST` open for `delayMs`, and nothing else — the same
 *  header-based match `up-next-motion.spec.ts` uses to find one without touching a URL. */
async function delayServerActions(page: Page, delayMs: number): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

test("search answers while a watch mark is still saving, without waiting for the write", async ({
  page,
}) => {
  // Comfortably longer than a debounced search has any business taking, so a result
  // landing inside the assertion's own timeout below is proof it skipped the queue rather
  // than a race against CI's variance.
  await delayServerActions(page, 2500);
  await page.route("**/api/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBothKinds("E2E Result While A Mark Is Saving")),
    }),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/up-next");

  const writeLanded = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  // Fired, not awaited: the write is still on the wire, held by `delayServerActions`,
  // for the rest of this test.
  await page.getByRole("button", { name: markEpisode(markable, 2) }).click();

  await page
    .getByRole("navigation", { name: "Primary" })
    .filter({ visible: true })
    .getByRole("link", { name: "Search" })
    .click();

  await page.getByRole("main").getByLabel("Search films and shows").fill("mock query");

  await expect(
    page.getByRole("main").getByRole("link", { name: "E2E Result While A Mark Is Saving" }),
  ).toBeVisible({ timeout: 1500 });

  // Leaves nothing hanging: the held write still gets to land before the test ends.
  await writeLanded;
});

test("a superseded query is aborted, and is never drawn as a read failure", async ({ page }) => {
  let supersededFailure: string | null = null;
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/search") && request.url().includes("q=superseded")) {
      supersededFailure = request.failure()?.errorText ?? "unknown";
    }
  });

  await page.route("**/api/search**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "superseded") {
      // Never answered on its own — only the client's own `AbortController`, firing when
      // the next query supersedes this one, ever ends this request.
      await new Promise(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBothKinds("E2E Result After Superseding")),
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/search");

  const field = page.getByRole("main").getByLabel("Search films and shows");

  const supersededRequestSent = page.waitForRequest(
    (request) => request.url().includes("/api/search") && request.url().includes("q=superseded"),
  );
  await field.fill("superseded");
  // Only once the first request is actually on the wire does typing again supersede a
  // request that was in flight, rather than merely clearing a debounce timer that had not
  // fired yet.
  await supersededRequestSent;

  await field.fill("the next one");

  await expect(
    page.getByRole("main").getByRole("link", { name: "E2E Result After Superseding" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("heading", { name: "This did not load" }),
  ).toHaveCount(0);

  await expect.poll(() => supersededFailure).not.toBeNull();
  expect(supersededFailure).toMatch(/abort/i);
});

test("a genuine read failure still shows the inline failure, with Try again", async ({ page }) => {
  await page.route("**/api/search**", (route) => route.abort("failed"));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/search");

  await page.getByRole("main").getByLabel("Search films and shows").fill("a genuine failure");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "This did not load" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(main.getByText("Nothing by that name")).toHaveCount(0);
});
