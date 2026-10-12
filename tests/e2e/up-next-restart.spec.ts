import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, seedWatchlistFilms } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #323's browser property — the one thing about a re-press that only a real scroll
 * position and a real horizontally-scrolled rail can prove:
 *
 * - **Pressing Tonight while already on Tonight** returns the scroll position to the top.
 * - **Arriving back from a title** — the case issue #276's restoration was built for —
 *   still restores Coming up's "Upcoming films" rail to the offset the reader left it at.
 *
 * Until issue #399 both were one screen: Coming up was the second page of the landing
 * pager on `/up-next`, and this spec also proved the re-press returned the pager to its
 * first page and that coming back restored the page. The pager is gone, so the address
 * says which screen the reader was on, and those two halves have nothing left to hold.
 *
 * ── Its own fixture account, not the shared one ───────────────────────────────────────
 *
 * `poster-morph.spec.ts`'s own reasoning applies unchanged: this needs a library with
 * content on both screens, which the shared account `pending-hold.spec.ts` depends on
 * staying empty is not.
 *
 * ── Why the viewport is shorter than `poster-morph.spec.ts`'s ─────────────────────────
 *
 * `500×721` is that spec's own measurement-driven number. This spec needs the *document*
 * to be taller than the *viewport* — the property the scroll-to-top assertion depends on
 * existing at all — and a shorter viewport gets there with a handful of seeded shows
 * rather than a library wide enough to overflow `721px` on its own.
 */

let userId: string;
let filmNames: readonly string[];

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  userId = session.userId;

  // Six shows, each queuing one unwatched episode, is enough cards on Continue watching to
  // push Tonight past a 400px viewport.
  for (let i = 0; i < 6; i += 1) {
    await seedWatchingShow(userId);
  }

  // Six films, wide enough to overflow the "Upcoming films" rail horizontally —
  // `seedWatchlistFilms`'s own docblock has the arithmetic.
  filmNames = await seedWatchlistFilms(userId, 6);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-restart-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "up-next-restart-session.json") });

test.beforeEach(async ({ page }) => {
  // Narrow enough for the phone tab bar. Shorter than `poster-morph.spec.ts`'s own `721px`
  // for the reason in the file docblock above.
  await page.setViewportSize({ width: 500, height: 400 });
});

const tonightTabBarLink = (page: Page) =>
  page.locator('nav.phone-tab-bar a[href="/up-next"]');

const upcomingFilmsRail = (page: Page) =>
  page
    .locator("section", { has: page.getByRole("heading", { name: "Upcoming films" }) })
    .locator("ol");

async function goToComingUpAndScrollTheRail(page: Page): Promise<void> {
  await page.goto("/coming-up");

  await expect(upcomingFilmsRail(page)).toBeVisible();
  // `bubbles: true` is not this event's native behaviour — an element's own `scroll` does
  // not bubble — but it is what makes the dispatch reach React's handler synchronously,
  // inside this one `evaluate`, rather than racing the real (asynchronous) browser event
  // against the click that navigates away next. `recordScroll` (`remembered-rail.tsx`)
  // reads `el.scrollLeft` itself, so the manufactured event only has to arrive, not carry
  // real coordinates.
  await upcomingFilmsRail(page).evaluate((el) => {
    el.scrollLeft = 150;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

test("pressing Tonight while already on Tonight returns to the top", async ({ page }) => {
  await page.goto("/up-next");
  await expect(tonightTabBarLink(page)).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => window.scrollTo(0, 200));

  // Proven scrolled before proving reset, so a document too short to scroll cannot pass by
  // accident.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await tonightTabBarLink(page).click();

  await expect(page).toHaveURL(/\/up-next$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("returning from a title still restores Coming up's rail offset", async ({ page }) => {
  await goToComingUpAndScrollTheRail(page);

  /**
   * **A film that is on screen at the offset above, and not the first one.**
   *
   * Clicking a card the rail has scrolled *past* is not a neutral act: focusing it makes
   * the browser scroll it back into view, the track's own `onScroll` records that as the
   * reader's position, and the offset this test is about is destroyed before the
   * navigation even starts. Asserted against directly — with `filmNames[0]` the track
   * records `150`, then `0`, and comes back to `0`; with a card already in view it records
   * `150` and comes back to `150`.
   *
   * So the first film tested the browser's scroll-into-view rather than this application's
   * memory, and a reader tapping a card they can see never meets that path at all.
   */
  const film = page.getByRole("link", { name: new RegExp(filmNames[3]) });

  /**
   * **The offset is read after the card is in view, and asserted against itself.**
   *
   * How far the browser scrolls a card into view depends on where that card sits, which
   * is a function of the viewport and the card width — so the offset the rail is *left*
   * at differs between a developer's machine and a runner. Pinning a literal asserted the
   * layout rather than the memory: the same correct application read `0` with the first
   * card, `150` locally, and `300` in CI.
   *
   * So the card is brought into view first, the settled offset is read, and that is what
   * returning has to restore. The guard keeps it from passing vacuously at zero.
   */
  await film.scrollIntoViewIfNeeded();
  await expect
    .poll(() => upcomingFilmsRail(page).evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const leftAt = await upcomingFilmsRail(page).evaluate((el) => el.scrollLeft);

  await film.click();
  await expect(page.getByRole("heading", { name: filmNames[3], level: 1 })).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/coming-up$/);
  await expect
    .poll(() => upcomingFilmsRail(page).evaluate((el) => el.scrollLeft))
    .toBe(leftAt);
});
