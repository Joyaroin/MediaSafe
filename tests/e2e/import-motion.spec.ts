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
 * ── Few real titles, the rest ids TMDB cannot have ──────────────────────────────────
 *
 * The bar is *titles written over total*, so a chunk moves it as long as it writes
 * anything. Each of the first two chunks leads with a few long-standing TMDB film ids
 * (famous enough to be in no danger of leaving the catalogue) and is padded with ids far
 * past any TMDB has issued. Those come back as TMDB's own 404 and are skipped per title
 * (`import/actions.ts`), which is fast — so the run proves the same motion in seconds
 * rather than mirroring fifty real films, which took minutes and made the timing of the
 * chunks the thing under test.
 */
const REAL_PER_CHUNK = [
  [550, 238, 680],
  [278, 155, 27205],
];

/** No TMDB film has an id this high; each comes back 404 and is skipped. */
const NO_SUCH_FILM = 990_000_000;

const FILM_IDS = Array.from({ length: IMPORT_CHUNK_SIZE * 2 + 1 }, (_, index) => {
  const chunk = Math.floor(index / IMPORT_CHUNK_SIZE);
  const real = REAL_PER_CHUNK[chunk]?.[index % IMPORT_CHUNK_SIZE];
  return real ?? NO_SUCH_FILM + index;
});

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

  // Recorded, not sampled: every transform the bar is given and every roll that starts,
  // from before the file is chosen. Polling the computed style raced the chunks — one
  // could land mid-transition, or the run reach *done* (which removes the bar) between
  // two polls — so the test now reads what happened after the run, instead of hoping to
  // be looking at the right moment.
  await page.evaluate(() => {
    const seen = { transforms: [] as string[], rolled: false };
    (window as unknown as { importSeen: typeof seen }).importSeen = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        if (record.type === "attributes" && target.classList.contains("progress-fill")) {
          const value = (target as HTMLElement).style.transform;
          if (value !== seen.transforms.at(-1)) seen.transforms.push(value);
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches(".roll-in") || node.querySelector(".roll-in"))) {
            seen.rolled = true;
          }
        }
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  });

  await main.getByLabel("Choose your file").setInputFiles(nativeImportFile());

  await expect(main.getByRole("heading", { name: "Importing your library" })).toBeVisible();

  const fill = main.locator(".progress-fill");

  // Never `width`: the fill carries no inline `width`, and slides by `transform` instead.
  expect(await fill.evaluate((element) => (element as HTMLElement).style.width)).toBe("");
  // Tailwind v4's `transition-transform` lists the individual transform properties too
  // (`transform, translate, scale, rotate`), so this reads the list rather than one value:
  // `transform` is on it, and `width` — the size §11.4 never animates — is not.
  const transitioned = (
    await fill.evaluate((element) => getComputedStyle(element).transitionProperty)
  )
    .split(",")
    .map((property) => property.trim());
  expect(transitioned).toContain("transform");
  expect(transitioned).not.toContain("width");
  // `--dur-base` (220ms) — a chunk landing is a routine state change, the ramp position
  // the poster and title-page bars already use.
  expect(await fill.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0.22s",
  );

  // The run finishes: *Import done* arrives on the existing rise, never a hard cut.
  const heading = main.getByRole("heading", { name: "Import done" });
  await expect(heading).toBeVisible({ timeout: 150_000 });

  const seen = await page.evaluate(
    () => (window as unknown as { importSeen: { transforms: string[]; rolled: boolean } }).importSeen,
  );

  // The bar moved by `transform` once per chunk that painted — the first two chunks; the
  // last chunk's update is batched with *done* (see the docblock above) — "between
  // chunks", not a single jump from nothing to everything. Each step slides it further
  // right: less of the fill is held back off the track's left edge.
  const offsets = seen.transforms.map((value) => Number(/translateX\((-?[\d.]+)%\)/.exec(value)?.[1]));
  expect(offsets.length).toBeGreaterThanOrEqual(2);
  for (const [index, offset] of offsets.entries()) {
    expect(Number.isFinite(offset)).toBe(true);
    if (index > 0) expect(offset).toBeGreaterThan(offsets[index - 1]);
  }

  // The counters rolled through the existing `Roll`, in the same beat as the bar.
  expect(seen.rolled).toBe(true);
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
