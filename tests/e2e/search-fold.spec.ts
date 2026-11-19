import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #554 — Search folds a kind's results that have neither a year nor a poster into
 * one "N more results" line, and the line opens them in place, once. The fold's rule is
 * unit-tested in `tests/search-groups.test.ts`; this is what only a browser shows: the
 * line is a real button with `aria-expanded`, and pressing it puts the rows on the page
 * without leaving it.
 *
 * ── The search answer is fixed, not read from TMDB ───────────────────────────────────
 *
 * Which titles TMDB returns with no year and no poster changes week to week, so the
 * Server Action's answer is replaced with a known one. The request still goes out and
 * the real response's first flight line (the build id) is kept; only the action's return
 * value — flight row `1:` — is swapped.
 *
 * Its own fixture account, so nothing here can leak into the shared one.
 */

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "search-fold-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "search-fold-session.json") });

function result(kind: "show" | "film", tmdbId: number, name: string, extra: object) {
  return { kind, tmdbId, name, audienceScore: null, inLibrary: false, ...extra };
}

const ANSWER = {
  show: {
    ok: true,
    results: [
      result("show", 9001, "Folded Plain Show", { releaseYear: null, posterPath: null }),
      result("show", 9002, "Kept With Both Show", { releaseYear: 2021, posterPath: "/kept.jpg" }),
      result("show", 9003, "Kept With Year Show", { releaseYear: 2018, posterPath: null }),
      result("show", 9004, "Folded Second Show", { releaseYear: null, posterPath: null }),
    ],
  },
  film: {
    ok: true,
    results: [
      result("film", 9101, "Kept With Poster Film", { releaseYear: null, posterPath: "/film.jpg" }),
      result("film", 9102, "Folded Only Film", { releaseYear: null, posterPath: null }),
    ],
  },
};

/** Fixes the search action's answer; returns a counter of how many it answered. */
async function stubSearchAnswer(page: Page) {
  const state = { answered: 0 };
  await page.route("**/search", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      return route.fallback();
    }
    const real = await route.fetch();
    const [first] = (await real.text()).split("\n");
    state.answered += 1;
    await route.fulfill({
      response: real,
      body: `${first}\n1:${JSON.stringify(ANSWER)}\n`,
    });
  });
  return state;
}

test("a kind's results with no year and no poster fold into one line that opens in place", async ({
  page,
}) => {
  const stub = await stubSearchAnswer(page);

  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search films and shows" }).fill("fold");

  const shows = page.getByRole("region", { name: "Shows" });
  const films = page.getByRole("region", { name: "Films" });

  // The setup happened: our answer is what rendered, so the kept rows are on the page.
  await expect(shows.getByRole("link", { name: "Kept With Both Show" })).toBeVisible();
  expect(stub.answered).toBeGreaterThan(0);
  await expect(shows.getByRole("link", { name: "Kept With Year Show" })).toBeVisible();
  await expect(films.getByRole("link", { name: "Kept With Poster Film" })).toBeVisible();

  // Folded: the bare results are not on the page, and the line counts them.
  await expect(shows.getByRole("link", { name: "Folded Plain Show" })).toHaveCount(0);
  await expect(shows.getByRole("link", { name: "Folded Second Show" })).toHaveCount(0);
  const showFold = shows.getByRole("button", { name: "2 more results" });
  await expect(showFold).toHaveAttribute("aria-expanded", "false");

  // One folded result still folds, and the line says so in the singular.
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toHaveCount(0);
  const filmFold = films.getByRole("button", { name: "1 more result" });
  await expect(filmFold).toHaveAttribute("aria-expanded", "false");

  await showFold.click();

  // Focus moved with the press: the line that had it is gone, and without this the next
  // Tab would skip the rows just opened (WCAG 2.4.3). It is on the first revealed row.
  await expect(shows.getByRole("link", { name: "Folded Plain Show" })).toBeFocused();

  // Opened in place: the same page, the rows now present, the other kind untouched.
  await expect(shows.getByRole("button", { name: /more result/ })).toHaveCount(0);
  await expect(shows.getByRole("link", { name: "Folded Plain Show" })).toBeVisible();
  await expect(shows.getByRole("link", { name: "Folded Second Show" })).toBeVisible();
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/search");

  await filmFold.click();
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toBeVisible();
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toBeFocused();
  await expect(films.getByRole("button", { name: /more result/ })).toHaveCount(0);
  // Opening is one way: the shows' rows are still on the page, nothing folded them back.
  await expect(shows.getByRole("link", { name: "Folded Plain Show" })).toBeVisible();
});

test("opening a fold with the keyboard leaves focus on the first revealed row, and Tab goes on through it", async ({
  page,
}) => {
  const stub = await stubSearchAnswer(page);
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search films and shows" }).fill("fold");

  const shows = page.getByRole("region", { name: "Shows" });
  const films = page.getByRole("region", { name: "Films" });
  await expect(shows.getByRole("link", { name: "Kept With Both Show" })).toBeVisible();
  expect(stub.answered).toBeGreaterThan(0);

  const showFold = shows.getByRole("button", { name: "2 more results" });
  await showFold.focus();
  await expect(showFold).toBeFocused();
  await page.keyboard.press("Enter");

  const firstRevealed = shows.getByRole("link", { name: "Folded Plain Show" });
  await expect(firstRevealed).toBeFocused();

  // Tab continues inside the revealed row, not past it to the Films rows.
  const firstRevealedRow = shows.getByRole("listitem").filter({
    has: page.getByRole("link", { name: "Folded Plain Show" }),
  });
  await page.keyboard.press("Tab");
  await expect(firstRevealedRow.locator(":focus")).toHaveCount(1);
  await expect(films.locator(":focus")).toHaveCount(0);

  // The same for the films fold.
  const filmFold = films.getByRole("button", { name: "1 more result" });
  await filmFold.focus();
  await page.keyboard.press("Enter");
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toBeFocused();
});
