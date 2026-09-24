import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, seedWatchlistFilms } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #323's browser property — the one thing about a re-press that only a real
 * scroll position, a real pager and a real horizontally-scrolled rail can prove:
 *
 * - **Pressing Up next while already on Up next** returns the scroll position to the
 *   top, the landing pager to its first page, and the "Upcoming movies" rail to its
 *   start.
 * - **Arriving back from a title** — the case issue #276's restoration was built for —
 *   still restores the pager's page and the rail's offset exactly as it does today.
 *
 * Both halves are named explicitly, and one spec is asked for that
 * asserts them together, so a regression that fixed one by breaking the other could not
 * pass by accident.
 *
 * ── Its own fixture account, not the shared one ───────────────────────────────────────
 *
 * `poster-morph.spec.ts`'s own reasoning applies unchanged: this needs a library that
 * genuinely has content on both pager pages, which the shared account
 * `pending-hold.spec.ts` depends on staying empty is not.
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

  // Six shows, each queuing one unwatched episode, is enough rows on "Next episodes" to
  // push the Up next panel past a 400px viewport — and both pager panels are mounted at
  // once (`landing-pager.tsx` keeps the page not being read `inert` rather than absent),
  // so the document is this tall regardless of which page is showing.
  for (let i = 0; i < 6; i += 1) {
    await seedWatchingShow(userId);
  }

  // Six films, wide enough to overflow the "Upcoming movies" rail horizontally —
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
  // Narrow enough for the phone tab bar and the landing pager, per `page.tsx`'s `lg:hidden`
  // gate. Shorter than `poster-morph.spec.ts`'s own `721px` for the reason in the file
  // docblock above.
  await page.setViewportSize({ width: 500, height: 400 });
});

const upNextTabBarLink = (page: Page) =>
  page.locator('nav.phone-tab-bar a[href="/up-next"]');

const upcomingMoviesRail = (page: Page) =>
  page
    .locator("section", { has: page.getByRole("heading", { name: "Upcoming movies" }) })
    .locator("ol");

async function goToUpcomingPageAndScroll(page: Page): Promise<void> {
  await page.goto("/up-next");
  await page.getByRole("tab", { name: "Coming up" }).click();
  await expect(page.getByRole("tab", { name: "Coming up" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await expect(upcomingMoviesRail(page)).toBeVisible();
  // `bubbles: true` is not this event's native behaviour — an element's own `scroll` does
  // not bubble — but it is what makes the dispatch reach React's handler synchronously,
  // inside this one `evaluate`, rather than racing the real (asynchronous) browser event
  // against the click that navigates away next. `recordScroll` (`remembered-rail.tsx`)
  // reads `el.scrollLeft` itself, so the manufactured event only has to arrive, not carry
  // real coordinates.
  await upcomingMoviesRail(page).evaluate((el) => {
    el.scrollLeft = 150;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.evaluate(() => window.scrollTo(0, 200));
}

test("pressing Up next while already on Up next resets the scroll position, the pager and the rail", async ({
  page,
}) => {
  await goToUpcomingPageAndScroll(page);

  // The preconditions this test is actually about — proven scrolled before proving reset,
  // so a rail too short to scroll or a document too short to page cannot pass by accident.
  await expect
    .poll(() => upcomingMoviesRail(page).evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await upNextTabBarLink(page).click();

  await expect(page.getByRole("tab", { name: "Up next" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  /**
   * **The rail is checked by going back to it, because the reset takes it off screen.**
   *
   * A restart returns the pager to its first page, and `landing-pager.tsx` renders only
   * the page being read once the router has refreshed — so the Upcoming panel, and the
   * rail inside it, are gone from the document. Polling that rail's `scrollLeft` here
   * asked an element that does not exist and timed out forever, which reads as *the rail
   * did not reset* and is really *the rail is not there*.
   *
   * Asking for Upcoming again is also the truer question. What the reader is promised is
   * that the rails are back at their starts when they next look, and this is them next
   * looking.
   */
  await page.getByRole("tab", { name: "Coming up" }).click();
  await expect
    .poll(() => upcomingMoviesRail(page).evaluate((el) => el.scrollLeft))
    .toBe(0);
});

test("returning from a title still restores the pager's page and the rail's offset", async ({
  page,
}) => {
  await goToUpcomingPageAndScroll(page);

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
    .poll(() => upcomingMoviesRail(page).evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const leftAt = await upcomingMoviesRail(page).evaluate((el) => el.scrollLeft);

  await film.click();
  await expect(page.getByRole("heading", { name: filmNames[3], level: 2 })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole("tab", { name: "Coming up" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() => upcomingMoviesRail(page).evaluate((el) => el.scrollLeft))
    .toBe(leftAt);
});
