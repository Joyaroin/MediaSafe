import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createPool, requireDatabaseUrl } from "@/db/driver";
import * as schema from "@/db/schema";
import { seedFixtureSession } from "./support/fixture-session";
import { seedListOfFilms } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #466 — everything you can open answers the finger the same way: a recommendation
 * card in Search, a suggestion card on Tonight, a list row, a *…* menu item, a settings
 * row and a sidebar item all compress under a finger at the surface depth.
 * `tests/press-spring.test.ts` proves the stylesheet; this proves what a reader actually
 * gets, the way `press-reaches-buttons.spec.ts` does for the shared button base — a real
 * pointer held down over a real element, and the computed `transform` it produces.
 *
 * ── One seed, for two network-dependent surfaces ──────────────────────────────────────
 *
 * Neither the recommendation rail nor the suggestion rail has a trending fallback for a
 * *personalised* recommendation — `recommendation-rail.tsx`'s own docblock: no watched
 * seed, no rail at all. So this fixture watches one real, long-standing film (Fight Club,
 * TMDB id 550 — chosen for a recommendations list TMDB is in no danger of ever emptying)
 * directly through the driver, `fixture-library.ts`'s own reasoning for why that is fine:
 * nothing here is reachable from application code, for an account no read here pretends
 * is real user data. One seed answers both rails in one account rather than two.
 *
 * Reads TMDB live, as the search and Up next suggestion specs already do, and skips the
 * same way `one-app.spec.ts`'s own search test does when the local `.env` carries only a
 * placeholder token.
 */

const NEEDS_LIVE_TMDB = (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-");

const DESKTOP = { width: 1280, height: 900 };

const FIGHT_CLUB_TMDB_ID = 550;

/**
 * **Find or create the title row.** `title`'s own `(kind, tmdb_id)` uniqueness is on the
 * real TMDB id, which is deliberately shared across every run of this spec rather than
 * random the way `seedWatchingShow`'s own id is — a real id is the whole point here. So a
 * second run (a retry, a second builder, a dev loop) has to reuse the row the first run
 * left rather than collide with it; only the account, the library entry and the watch
 * below are fresh every time.
 */
async function seedWatchedFilm(userId: string, tmdbId: number, name: string): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  const db = drizzle(pool, { schema });

  try {
    const existing = await db
      .select({ id: schema.title.id })
      .from(schema.title)
      .where(and(eq(schema.title.kind, "film"), eq(schema.title.tmdbId, tmdbId)))
      .limit(1);

    const titleRow =
      existing[0] ??
      (
        await db
          .insert(schema.title)
          .values({
            kind: "film",
            tmdbId,
            name,
            releaseYear: 1999,
            posterPath: `/e2e-fixture-${randomUUID()}.jpg`,
          })
          .returning({ id: schema.title.id })
      )[0];

    const [entryRow] = await db
      .insert(schema.libraryEntry)
      .values({ userId, titleId: titleRow.id })
      .returning({ id: schema.libraryEntry.id });

    await db.insert(schema.watch).values({
      userId,
      libraryEntryId: entryRow.id,
      titleId: titleRow.id,
      episodeId: null,
      watchedAt: new Date(),
      source: "e2e-fixture",
      sourceKey: randomUUID(),
    });
  } finally {
    await pool.end();
  }
}

/** The matrix a `scale(s)` transform computes to, with no rotation or skew — copied from
 *  `press-reaches-buttons.spec.ts` rather than imported, since nothing outside `tests/`
 *  shares test-only helpers. */
function scaleOf(transform: string): number {
  const match = transform.match(/^matrix\(([^,]+),\s*([^,]+),/);
  expect(match, `${transform} is not a 2D matrix`).not.toBeNull();
  const [, a, b] = match!;
  expect(Number(b)).toBeCloseTo(0, 5);
  return Number(a);
}

/** Holds the pointer down over `target`'s centre, reads the computed `transform` of
 *  `target` and every one of `others` once the press's own transition (`--dur-press`,
 *  100ms) has had time to settle, then releases the pointer away from the element so no
 *  click is ever dispatched. The first reading is `target`'s own. */
async function pressedTransforms(
  page: Page,
  target: Locator,
  others: readonly Locator[] = [],
): Promise<string[]> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const transforms = await Promise.all(
    [target, ...others].map((locator) => locator.evaluate((el) => getComputedStyle(el).transform)),
  );
  // Away from the element before releasing: a mouseup over the same box as the mousedown
  // is a click, and several of these targets navigate or write on one.
  await page.mouse.move(0, 0);
  await page.mouse.up();

  return transforms;
}

test.describe("one account, for the two network-dependent surfaces and everything else", () => {
  let userId: string;
  let listId: string;
  let listName: string;

  test.beforeAll(async () => {
    const session = await seedFixtureSession();
    userId = session.userId;

    await seedWatchedFilm(userId, FIGHT_CLUB_TMDB_ID, "E2E Fixture Fight Club");
    const list = await seedListOfFilms(userId, [
      "Alpha E2E Press Film",
      "Bravo E2E Press Film",
    ]);
    listId = list.listId;
    listName = list.listName;

    const authDir = path.join(__dirname, ".auth");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      path.join(authDir, "press-reaches-surfaces-session.json"),
      JSON.stringify(toStorageState(session), null, 2),
    );
  });

  test.use({
    storageState: path.join(__dirname, ".auth", "press-reaches-surfaces-session.json"),
  });

  // ── The surfaces that need no network ────────────────────────────────────────────

  test("a list row's computed transform scales down while pressed, at the surface depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/library?view=lists");

    const row = page.getByRole("main").getByRole("link", { name: new RegExp(listName) });
    await expect(row).toBeVisible();

    const resting = await row.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, row);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);
  });

  test("a menu item's computed transform scales down while pressed, at the surface depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/lists/${listId}`);

    const main = page.getByRole("main");
    await main.getByLabel(`More for ${listName}`).click();
    const rename = main.getByRole("button", { name: "Rename", exact: true });
    await expect(rename).toBeVisible();

    const resting = await rename.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, rename);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);
  });

  test("a settings row's computed transform scales down while pressed, at the surface depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/settings");

    const importRow = page.getByRole("main").getByRole("link", { name: "Import a library" });
    await expect(importRow).toBeVisible();

    const resting = await importRow.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    const [pressed] = await pressedTransforms(page, importRow);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);

    // Released, back to resting — the compression is a transition and not a stuck state.
    await page.waitForTimeout(200);
    expect(await importRow.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("a sidebar item's computed transform scales down while pressed, at the surface depth", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/up-next");

    const sidebar = page
      .getByRole("navigation", { name: "Primary" })
      .filter({ visible: true });
    const search = sidebar.getByRole("link", { name: "Search", exact: true });
    await expect(search).toBeVisible();

    const resting = await search.evaluate((el) => getComputedStyle(el).transform);

    const [pressed] = await pressedTransforms(page, search);
    expect(pressed).not.toBe(resting);
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);
  });

  // ── The two network-dependent surfaces ───────────────────────────────────────────

  test("a recommendation card's computed transform scales down while pressed, at the surface depth", async ({
    page,
  }) => {
    test.skip(NEEDS_LIVE_TMDB, "needs a real TMDB_READ_ACCESS_TOKEN");

    await page.setViewportSize(DESKTOP);
    await page.goto("/search");

    const rail = page.getByRole("main").getByRole("list", { name: "Because you watched" });
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const card = rail.locator("li").first();
    const open = card.getByRole("link");
    await expect(open).toBeVisible();

    // The rail's own `stagger-rise` arrival (`globals.css`) runs this card's rise over
    // `--dur-base` (220ms) the moment it mounts, which can still be moving in the instant
    // `rail` first reports visible — well past it, rather than mid-rise, is the point.
    await page.waitForTimeout(300);

    const resting = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(resting).toBe("none");

    // Pressing the poster/name link, not the card's own element — `closest(".pressable")`
    // (`motion-provider.tsx`) finds this card's `<Link>` itself, since the whole card here
    // *is* the link (`recommendation-rail.tsx` carries no nested pill).
    const [pressed] = await pressedTransforms(page, open);
    expect(pressed).not.toBe("none");
    expect(scaleOf(pressed)).toBeCloseTo(0.96, 2);
  });

  test("a suggestion card presses as two things: the pill alone, or the card alone", async ({
    page,
  }) => {
    test.skip(NEEDS_LIVE_TMDB, "needs a real TMDB_READ_ACCESS_TOKEN");

    await page.setViewportSize(DESKTOP);
    await page.goto("/up-next");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Nothing queued for tonight" })).toBeVisible();

    const rail = main.getByRole("list", { name: "Because you watched" });
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const card = rail.locator("li").first();
    const open = card.getByRole("link");
    const pill = card.getByRole("button", { name: /^Add .* to your library$/ });
    await expect(pill).toBeVisible();

    // Clear of the rail's own `stagger-rise` arrival first — the same reason the
    // recommendation card's own test waits it out.
    await page.waitForTimeout(300);

    // Pressing the card's own pill presses only the pill: the pill's own transform scales
    // down to the control register, and the card around it — read mid-press, over the
    // same gesture — stays exactly where it was. This is the property
    // `globals.css`'s `pressable` docblock names and `:not(:has(.pressable:active))`
    // exists for: `:active` matches every ancestor of the pressed element, and without the
    // guard the card would answer the same press a second time.
    const [pillPressed, cardWhilePillPressed] = await pressedTransforms(page, pill, [card]);
    expect(pillPressed).not.toBe("none");
    expect(scaleOf(pillPressed)).toBeCloseTo(0.92, 2);
    expect(cardWhilePillPressed).toBe("none");

    // Pressing anywhere else on the card presses the card, at the surface depth — and the
    // pill, which the finger never touched, stays exactly where it was. The mouse goes
    // down over `open` (the poster/name link, which carries no `pressable` of its own),
    // but what is read is the `<li>` around it — `open` itself never gets a transform;
    // `closest(".pressable")` from inside it is what finds the card.
    const [, cardPressed, pillWhileCardPressed] = await pressedTransforms(page, open, [
      card,
      pill,
    ]);
    expect(cardPressed).not.toBe("none");
    expect(scaleOf(cardPressed)).toBeCloseTo(0.96, 2);
    expect(pillWhileCardPressed).toBe("none");
  });
});
