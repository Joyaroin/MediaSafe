import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { IMPORT_CHUNK_SIZE } from "@/import/chunking";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #444 — Import's bar moves and its finish arrives (handoff §8.12, §11.4).
 *
 * The bar is slid by `transform`, never sized by `width` (issue #407's rule, now reaching
 * a third bar); it eases between chunk landings on `--dur-base`, the same ramp position
 * the poster and title-page bars already tie themselves to; its three counters roll
 * through the existing `Roll`; and the finish — *Import done* — arrives on the existing
 * `arrive` region entrance rather than hard-cutting into place.
 *
 * Needs a real `TMDB_READ_ACCESS_TOKEN`: the import screen's one Server Action resolves
 * every title against the live catalogue (`import-surface.tsx`'s `applyImportChunkAction`),
 * the same reason `one-app.spec.ts`'s search test skips on a placeholder token.
 *
 * ── Three chunks, not one ─────────────────────────────────────────────────────────────
 *
 * `import-surface.tsx`'s `run()` sets the running phase once per landed chunk, but the
 * very last chunk's update and the following `done` update are two `setPhase` calls with
 * no `await` between them — React's automatic batching commits only the second, so the
 * last chunk's own bar position never paints. Two chunks would therefore show the bar
 * move exactly once (the initial zero state landing its first chunk) before jumping
 * straight to `done`. Three — `IMPORT_CHUNK_SIZE * 2 + 1` titles — give the suite two
 * chunks whose landing genuinely paints, which is what "between chunks" (plural) asks
 * for: the real network call before each of the first two chunks' successors gives the
 * browser room to commit and paint the one before it.
 *
 * Mostly real, long-standing TMDB film ids (famous enough to be in no danger of leaving
 * the catalogue), padded with a run of filler ids the test does not depend on resolving —
 * what the assertions need is *most* of a chunk landing, never *every* title in it.
 */
const CONFIDENT_FILM_IDS = [
  550, 238, 680, 278, 155, 27205, 603, 13, 597, 769, 274, 807, 8587, 862, 329, 105, 98, 497, 73,
  424, 1124, 77, 1422, 244786, 496243, 157336, 129, 14160, 354912, 10681, 12, 313369,
];

const TOTAL_TITLES = IMPORT_CHUNK_SIZE * 2 + 1;

const FILLER_FILM_IDS = Array.from(
  { length: Math.max(0, TOTAL_TITLES - CONFIDENT_FILM_IDS.length) },
  (_, index) => 100_000 + index,
);

const FILM_IDS = [...CONFIDENT_FILM_IDS, ...FILLER_FILM_IDS].slice(0, TOTAL_TITLES);

function nativeImportFile(): { name: string; mimeType: string; buffer: Buffer } {
  const file = {
    source: "e2e-fixture",
    titles: FILM_IDS.map((tmdbId) => ({ tmdb_id: tmdbId, kind: "film", abandoned: false })),
    watches: [],
  };
  return {
    name: "library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  };
}

function needsRealTmdb(): boolean {
  return (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-");
}

test.beforeAll(async () => {
  // Seeded unconditionally, even when the suite below will skip: `test.use`'s
  // `storageState` is read while the browser context is created, before a test's own
  // `test.skip` call ever runs, so the file has to exist either way.
  const session = await seedFixtureSession();
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "import-motion-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "import-motion-session.json") });

test("the bar eases on transform between chunks, and the finish arrives", async ({ page }) => {
  // Search reaches the live catalogue, and so does import. A placeholder token (a
  // `test-` prefix, as the local `.env` carries) cannot, so the property is unprovable
  // here rather than failing — the same skip `one-app.spec.ts`'s search test takes.
  test.skip(needsRealTmdb(), "needs a real TMDB_READ_ACCESS_TOKEN");
  test.setTimeout(180_000);

  await page.goto("/import");
  const main = page.getByRole("main");
  await main.getByLabel("Choose your file").setInputFiles(nativeImportFile());

  await expect(main.getByRole("heading", { name: "Importing your library" })).toBeVisible();

  const fill = main.locator(".progress-fill");
  const transformOf = () => fill.evaluate((element) => getComputedStyle(element).transform);

  // Never `width`: the fill carries no inline `width`, and slides by `transform` instead.
  expect(await fill.evaluate((element) => (element as HTMLElement).style.width)).toBe("");
  expect(await fill.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe(
    "transform",
  );
  // `--dur-base` (220ms) — a chunk landing is a routine state change, the ramp position
  // the poster and title-page bars already use.
  expect(await fill.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0.22s",
  );

  const beforeAnyChunk = await transformOf();
  await expect.poll(transformOf, { timeout: 150_000 }).not.toBe(beforeAnyChunk);
  const afterFirstChunk = await transformOf();

  // The bar's `transform` moves again as the second chunk lands — "between chunks", not
  // a single jump from nothing to everything.
  await expect.poll(transformOf, { timeout: 150_000 }).not.toBe(afterFirstChunk);
  const afterSecondChunk = await transformOf();
  expect(afterSecondChunk).not.toBe(afterFirstChunk);

  // The three counters roll through the existing `Roll`, in the same beat as the bar.
  const rolled = main.getByRole("status").locator(".roll-in");
  expect(await rolled.count()).toBeGreaterThan(0);
  expect(
    await rolled.first().evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("roll-in");

  // The run finishes: *Import done* arrives on the existing rise, never a hard cut.
  const heading = main.getByRole("heading", { name: "Import done" });
  await expect(heading).toBeVisible({ timeout: 150_000 });
  const doneRoot = main.locator(".arrive", { hasText: "Import done" });
  await expect(doneRoot).toHaveCount(1);
  expect(await doneRoot.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "rise-in",
  );
});

test.describe("under reduced motion", () => {
  test("the bar and the counters change, and the finish appears, without moving", async ({
    page,
  }) => {
    test.skip(needsRealTmdb(), "needs a real TMDB_READ_ACCESS_TOKEN");
    test.setTimeout(180_000);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/import");
    const main = page.getByRole("main");
    await main.getByLabel("Choose your file").setInputFiles(nativeImportFile());

    await expect(main.getByRole("heading", { name: "Importing your library" })).toBeVisible();

    const fill = main.locator(".progress-fill");
    // The event still lands — the fill still ends up at the mark's new value — it just
    // stops travelling to get there (`globals.css`'s `.progress-fill` reduced-motion rule).
    expect(
      await fill.evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe("0.001s");

    const heading = main.getByRole("heading", { name: "Import done" });
    await expect(heading).toBeVisible({ timeout: 150_000 });

    // The finish still appears — the value change stays visible — but nothing travels in.
    const doneRoot = main.locator(".arrive", { hasText: "Import done" });
    expect(await doneRoot.evaluate((element) => getComputedStyle(element).transform)).toBe(
      "none",
    );
  });
});
