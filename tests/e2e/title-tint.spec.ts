import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { bandFor, TITLE_SCRIM, titleScrimAlpha } from "@/app/poster-tint";
import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";

import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

/**
 * The title hero's band in a real browser — Charcoal, issue #398, which replaced issue
 * #361's per-theme wash. The hero takes `bandFor(colour)`, one value in both themes, and a
 * title with no colour shows `raised` there.
 *
 * The colour is written straight onto the fixture title rather than extracted: fixture
 * posters are not real TMDB images, and extraction has its own tests
 * (`tests/poster-colour.test.ts`, `tests/poster-colour-fill.test.ts`).
 *
 * It also measures the one thing `tests/poster-tint.test.ts` has to take as given: that no
 * small text sits higher in the text block than `TITLE_SCRIM.smallTextFrom`, the depth
 * at which the scrim reaches the small-text floor — the state tag excepted, which carries
 * its own backing.
 */

const COLOUR = "#aa3119";

let tinted: SeededTitle;
let plain: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  tinted = await seedWatchingShow(session.userId);
  plain = await seedWatchingShow(session.userId);

  const pool = createPool(requireDatabaseUrl());
  try {
    await drizzle(pool, { schema })
      .update(schema.title)
      .set({ posterColour: COLOUR })
      .where(eq(schema.title.name, tinted.titleName));
  } finally {
    await pool.end();
  }

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-tint-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-tint-session.json") });

/** The hero's band layer: the `--band` it reads, and whether it painted `raised`. */
async function heroBand(
  page: Page,
  entry: SeededTitle,
): Promise<{ band: string | null; paintsRaised: boolean }> {
  await page.goto(`/titles/${entry.libraryEntryId}`);
  await expect(page.getByRole("heading", { level: 1, name: entry.titleName })).toBeVisible();
  return page.locator(".hero-recede-band").evaluate((el) => {
    const band = getComputedStyle(el).getPropertyValue("--band").trim();
    // `raised` resolved the way the browser resolves it, on a probe beside the band.
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-raised)";
    el.appendChild(probe);
    const raised = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      band: band === "" ? null : band,
      paintsRaised: getComputedStyle(el).backgroundColor === raised,
    };
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the hero takes the poster's band, the same value in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const { band, paintsRaised } = await heroBand(page, tinted);
    expect(band).toBe(bandFor(COLOUR));
    expect(paintsRaised).toBe(false);
  });

  test(`a title with no colour shows raised where the band would be, in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const { band, paintsRaised } = await heroBand(page, plain);
    expect(band).toBeNull();
    expect(paintsRaised).toBe(true);
  });
}

for (const { label, width, height } of [
  { label: "phone", width: 390, height: 844 },
  { label: "desktop", width: 1280, height: 860 },
] as const) {
  test(`no small text sits above the depth where the scrim reaches the small-text floor, ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/titles/${tinted.libraryEntryId}`);
    const heading = page.getByRole("heading", { level: 1, name: tinted.titleName });
    await expect(heading).toBeVisible();

    const offsets = await heading.evaluate((h1) => {
      const column = h1.parentElement!;
      const row = column.parentElement!;
      // The scrim's stops are measured from the row's content top — its top padding.
      const textTop = row.getBoundingClientRect().top + parseFloat(getComputedStyle(row).paddingTop);
      const children = [...column.children].filter((child) => child !== h1);
      // The state tag, when there is one, is first and carries its own backing.
      const small = children[0]?.classList.contains("bg-ground/85") ? children.slice(1) : children;
      return small.map((child) => child.getBoundingClientRect().top - textTop);
    });

    expect(offsets.length).toBeGreaterThan(0);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(TITLE_SCRIM.smallTextFrom);
    }
  });

  /**
   * Charcoal #403 sets the name at Title size (`56px`), so the fixture's *E2E Fixture Show
   * …* wraps on a phone — the case the slice's acceptance names. The block grows from the
   * row's content top, so wrapping moves nothing above it; this holds that, and checks the
   * two floors the small-text test above does not: the name's own top edge is large text
   * (§10: 60%), and the state tag is small text on its own 85% backing (90% with the scrim).
   */
  test(`a wrapped name and the state tag still clear §10's floors, ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/titles/${tinted.libraryEntryId}`);
    const heading = page.getByRole("heading", { level: 1, name: tinted.titleName });
    await expect(heading).toBeVisible();

    const measured = await heading.evaluate((h1) => {
      const column = h1.parentElement!;
      const row = column.parentElement!;
      const textTop = row.getBoundingClientRect().top + parseFloat(getComputedStyle(row).paddingTop);
      const tag = column.children[0]!.classList.contains("bg-ground/85") ? column.children[0]! : null;
      const box = h1.getBoundingClientRect();
      return {
        nameTop: box.top - textTop,
        lines: Math.round(box.height / parseFloat(getComputedStyle(h1).lineHeight)),
        tagTop: tag === null ? null : tag.getBoundingClientRect().top - textTop,
      };
    });

    if (label === "phone") expect(measured.lines).toBe(2);
    expect(titleScrimAlpha(measured.nameTop)).toBeGreaterThanOrEqual(0.6);
    expect(measured.tagTop).not.toBeNull();
    const tagCover = 1 - (1 - TITLE_SCRIM.stateTagBacking) * (1 - titleScrimAlpha(measured.tagTop!));
    expect(tagCover).toBeGreaterThanOrEqual(0.9);
  });
}
