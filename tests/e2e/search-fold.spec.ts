import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #554 — Search folds a kind's results that have neither a year nor a poster into
 * one "N more results" line, and the line opens them in place. The fold's rule is
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

test("a kind's results with no year and no poster fold into one line that opens in place", async ({
  page,
}) => {
  let answered = 0;
  await page.route("**/search", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      return route.fallback();
    }
    const real = await route.fetch();
    const [first] = (await real.text()).split("\n");
    answered += 1;
    await route.fulfill({
      response: real,
      body: `${first}\n1:${JSON.stringify(ANSWER)}\n`,
    });
  });

  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search films and shows" }).fill("fold");

  const shows = page.getByRole("region", { name: "Shows" });
  const films = page.getByRole("region", { name: "Films" });

  // The setup happened: our answer is what rendered, so the kept rows are on the page.
  await expect(shows.getByRole("link", { name: "Kept With Both Show" })).toBeVisible();
  expect(answered).toBeGreaterThan(0);
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

  // Opened in place: the same page, the rows now present, the other kind untouched.
  await expect(showFold).toHaveAttribute("aria-expanded", "true");
  await expect(shows.getByRole("link", { name: "Folded Plain Show" })).toBeVisible();
  await expect(shows.getByRole("link", { name: "Folded Second Show" })).toBeVisible();
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/search");

  await filmFold.click();
  await expect(films.getByRole("link", { name: "Folded Only Film" })).toBeVisible();
});
