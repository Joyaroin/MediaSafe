import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #551 — Tonight shows the shows you haven't started, in a **Not started** group under
 * Also ready, and leads with one when nothing is in Continue watching. Issue #574 — the
 * placement of a show started from the group follows the real rule, with no future-dated watch.
 *
 * ── The rule these specs hold ────────────────────────────────────────────────────────
 *
 * A show the reader just started from the group is their latest watch, so it is featured after
 * a reload, like any row the reader marks, **unless another show was watched more recently**
 * (Adham, 19 November 2026, on PR #572). So no fixture here dates a watch in the future: a
 * fixture date that out-ranks a mark made now would hide the rule instead of testing it.
 *
 * ── One account per scenario ─────────────────────────────────────────────────────────
 *
 * Every scenario that marks a row changes what its account's Tonight shows, and the rule is
 * about *recency*, so a scenario cannot share an account with another that marks. The shared
 * fixture account must stay empty too, for `up-next-restart.spec.ts`'s reason.
 *
 * - *busy*: a show in Continue watching, four Not started shows and a Dropped one. Read only.
 * - *restart*: the same, with Continue watching's watch dated two days ago. A mark from the
 *   group is the latest watch.
 * - *outranked*: the same again; the test itself then watches the Continue watching show,
 *   after the group mark, so that watch is the latest.
 * - *quiet*: two Not started shows and nothing else, so the newest is featured.
 * - *takeover*: three Not started shows and nothing else, for a mark from the group while the
 *   newest is featured.
 */

let watching: SeededTitle;
let notStarted: SeededTitle[];
let dropped: SeededTitle;
let quiet: SeededTitle[];

interface Library {
  readonly watching: SeededTitle;
  readonly notStarted: SeededTitle[];
}

const AUTH = path.join(__dirname, ".auth");
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** A Continue watching show (four episodes, the first watched) and four Not started shows,
 *  seeded oldest first, so `notStarted[3]` is the newest added. */
async function seedBusyLibrary(
  userId: string,
  watchedAt: Date,
  withDropped = false,
): Promise<Library & { readonly dropped: SeededTitle | null }> {
  const continuing = await seedShowWithSeason(userId, {
    episodes: 4,
    watched: [1],
    watchedAt,
  });
  const unstarted: SeededTitle[] = [];
  for (let at = 0; at < 4; at += 1) {
    unstarted.push(await seedShowWithSeason(userId, { episodes: 5, watched: [] }));
  }
  const abandoned = withDropped
    ? await seedShowWithSeason(userId, {
        episodes: 5,
        watched: [],
        abandoned: true,
      })
    : null;
  return { watching: continuing, notStarted: unstarted, dropped: abandoned };
}

/** Writes a fixture account's session where the specs below read it. */
function saveSession(name: string, session: Awaited<ReturnType<typeof seedFixtureSession>>) {
  writeFileSync(
    path.join(AUTH, `tonight-not-started-${name}.json`),
    JSON.stringify(toStorageState(session), null, 2),
  );
}

let restart: Library;
let outranked: Library;
let takeover: SeededTitle[];

test.beforeAll(async () => {
  mkdirSync(AUTH, { recursive: true });

  const busy = await seedFixtureSession();
  const seeded = await seedBusyLibrary(busy.userId, new Date(), true);
  watching = seeded.watching;
  notStarted = seeded.notStarted;
  dropped = seeded.dropped as SeededTitle;
  saveSession("busy", busy);

  const restarting = await seedFixtureSession();
  restart = await seedBusyLibrary(restarting.userId, new Date(Date.now() - TWO_DAYS_MS));
  saveSession("restart", restarting);

  const beaten = await seedFixtureSession();
  outranked = await seedBusyLibrary(beaten.userId, new Date(Date.now() - TWO_DAYS_MS));
  saveSession("outranked", beaten);

  const empty = await seedFixtureSession();
  quiet = [];
  for (let at = 0; at < 2; at += 1) {
    quiet.push(await seedShowWithSeason(empty.userId, { episodes: 5, watched: [] }));
  }
  saveSession("quiet", empty);

  const taking = await seedFixtureSession();
  // Oldest first: `takeover[2]` is the newest added, so it is the featured fallback.
  takeover = [];
  for (let at = 0; at < 3; at += 1) {
    takeover.push(await seedShowWithSeason(taking.userId, { episodes: 5, watched: [] }));
  }
  saveSession("takeover", taking);
});

const featured = (page: Page) => page.locator("[data-featured]");
const group = (page: Page) => page.getByRole("region", { name: "Not started" });
const alsoReady = (page: Page) => page.getByRole("region", { name: "Also ready" });
const rowIn = (scope: ReturnType<Page["locator"]>, show: SeededTitle) =>
  scope.locator("li", {
    has: scope.page().getByRole("link", { name: new RegExp(show.titleName) }),
  });

test.describe("with a show in Continue watching", () => {
  test.use({ storageState: path.join(AUTH, "tonight-not-started-busy.json") });

  for (const [device, size] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 900 }],
  ] as const) {
    test(`shows the three newest Not started shows on a ${device}, and no Dropped one`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/up-next");

      // The setup: Continue watching holds a show, so it is featured and the fallback is off.
      await expect(featured(page)).toContainText(watching.titleName);

      await expect(group(page).getByRole("heading", { name: "Not started" })).toBeVisible();
      await expect(group(page).locator("li")).toHaveCount(3);
      // Newest added first, and the fourth-newest is cut.
      await expect(group(page).locator("li").nth(0)).toContainText(notStarted[3].titleName);
      await expect(group(page).locator("li").nth(1)).toContainText(notStarted[2].titleName);
      await expect(group(page).locator("li").nth(2)).toContainText(notStarted[1].titleName);
      await expect(group(page)).not.toContainText(notStarted[0].titleName);
      await expect(page.getByText(dropped.titleName)).toHaveCount(0);

      await expect(group(page).locator("li").nth(0)).toContainText(
        "Start with S01 · E01 · Fixture Episode 1",
      );
      await expect(group(page)).not.toContainText("this season");
      await expect(group(page)).not.toContainText("remaining");
    });
  }

  test("the group is not part of Also ready's count or fold", async ({ page }) => {
    await page.goto("/up-next");
    // Also ready is empty here (the one Continue watching show is featured), so it has no
    // heading and no "See all": three Not started rows must not conjure one.
    await expect(group(page).locator("li")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /^See all/ })).toHaveCount(0);
    await expect(alsoReady(page)).toHaveCount(0);
  });
});

const STARTING_MARK = /^Mark .*, Season 1, Episode 1 — .* watched$/;

test.describe("starting a show from the group", () => {
  test.describe("with no other recent watch", () => {
    test.use({
      storageState: path.join(AUTH, "tonight-not-started-restart.json"),
    });

    test("closes the row, and after a reload the started show is featured", async ({ page }) => {
      const started = restart.notStarted[3];
      await page.goto("/up-next");
      // The setup: Continue watching's show leads, and the one to start is in the group.
      await expect(featured(page)).toContainText(restart.watching.titleName);
      await expect(rowIn(group(page), started)).toBeVisible();

      await rowIn(group(page), started).getByRole("button", { name: STARTING_MARK }).click();
      await expect(rowIn(group(page), started)).toHaveCount(0, {
        timeout: 10_000,
      });

      // The write has landed once a load features the started show: it is the latest watch.
      await expect(async () => {
        await page.reload();
        await expect(featured(page)).toContainText(started.titleName, {
          timeout: 2_000,
        });
      }).toPass({ timeout: 15_000 });
      await expect(featured(page)).toContainText("S01 · E02");
      // The show it displaced is still ready, in Also ready, not lost.
      await expect(rowIn(alsoReady(page), restart.watching)).toBeVisible();
      await expect(rowIn(alsoReady(page), started)).toHaveCount(0);
      await expect(group(page)).not.toContainText(started.titleName);
      // The fourth-newest has taken the freed place.
      await expect(group(page).locator("li")).toHaveCount(3);
      await expect(group(page)).toContainText(restart.notStarted[0].titleName);
    });
  });

  test.describe("with a more recent watch of another show", () => {
    test.use({
      storageState: path.join(AUTH, "tonight-not-started-outranked.json"),
    });

    test("leaves the started show in Also ready after a reload", async ({ page }) => {
      const started = outranked.notStarted[3];
      await page.goto("/up-next");
      await expect(featured(page)).toContainText(outranked.watching.titleName);

      // First the start from the group...
      await rowIn(group(page), started).getByRole("button", { name: STARTING_MARK }).click();
      await expect(rowIn(group(page), started)).toHaveCount(0, {
        timeout: 10_000,
      });

      // ...which takes the featured slot at once, as the latest watch, and puts the other show
      // in Also ready. Then a later, genuine watch of that other show, dated now: its row.
      await expect(featured(page)).toContainText(started.titleName);
      const other = rowIn(alsoReady(page), outranked.watching);
      await other
        .getByRole("button", {
          name: /^Mark .*, Season 1, Episode 2 — .* watched$/,
        })
        .click();
      // The setup: the mark held, and the row moved on to episode 3.
      await expect(other).toContainText("S01 · E03", { timeout: 10_000 });

      // Both writes have landed once a load features the other show at episode 3.
      await expect(async () => {
        await page.reload();
        await expect(featured(page)).toContainText("S01 · E03", {
          timeout: 2_000,
        });
      }).toPass({ timeout: 15_000 });
      await expect(featured(page)).toContainText(outranked.watching.titleName);
      await expect(featured(page)).not.toContainText(started.titleName);
      await expect(rowIn(alsoReady(page), started)).toBeVisible();
      await expect(rowIn(alsoReady(page), started)).toContainText("S01 · E02 · Fixture Episode 2");
      await expect(rowIn(alsoReady(page), started)).toContainText("1 of 5 this season");
      await expect(group(page)).not.toContainText(started.titleName);
    });
  });
});

test.describe("with nothing in Continue watching", () => {
  test.use({ storageState: path.join(AUTH, "tonight-not-started-quiet.json") });

  test("features the newest Not started show, left out of the group, and moves on to S01 E02", async ({
    page,
  }) => {
    const [older, newest] = quiet;
    await page.goto("/up-next");

    await expect(featured(page)).toContainText(newest.titleName);
    await expect(featured(page)).toContainText("Mark watched");
    await expect(
      featured(page).getByRole("button", { name: /Season 1, Episode 1 — / }),
    ).toBeVisible();
    // Left out of the group, which holds the other show.
    await expect(group(page).locator("li")).toHaveCount(1);
    await expect(group(page)).toContainText(older.titleName);
    await expect(group(page)).not.toContainText(newest.titleName);
    await expect(page.getByText(newest.titleName)).toHaveCount(1);

    await featured(page)
      .getByRole("button", { name: /Season 1, Episode 1 — / })
      .click();

    // As today's featured block: after the hold it moves on to the next episode.
    await expect(
      featured(page).getByRole("button", { name: /Season 1, Episode 2 — / }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(featured(page)).toContainText(newest.titleName);
    await expect(group(page).locator("li")).toHaveCount(1);
  });
});

test.describe("starting a show while a Not started show is featured", () => {
  test.use({
    storageState: path.join(AUTH, "tonight-not-started-takeover.json"),
  });

  test("the started show takes the featured slot and the fallback returns to the group", async ({
    page,
  }) => {
    const [oldest, middle, fallback] = takeover;
    await page.goto("/up-next");

    // The setup: nothing is in Continue watching, so the newest is featured and left out of
    // the group, which holds the other two.
    await expect(featured(page)).toContainText(fallback.titleName);
    await expect(group(page).locator("li")).toHaveCount(2);
    await expect(group(page)).not.toContainText(fallback.titleName);

    await rowIn(group(page), oldest).getByRole("button", { name: STARTING_MARK }).click();

    // The started show is now the latest watch, so it is featured at S01 E02, and the show
    // that was featured is back in the group beside the other.
    await expect(featured(page)).toContainText(oldest.titleName, {
      timeout: 10_000,
    });
    await expect(featured(page)).toContainText("S01 · E02");
    await expect(group(page).locator("li")).toHaveCount(2);
    await expect(rowIn(group(page), fallback)).toBeVisible();
    await expect(rowIn(group(page), middle)).toBeVisible();
    await expect(group(page)).not.toContainText(oldest.titleName);

    // And the same on the next load, where the write has to have landed.
    await expect(async () => {
      await page.reload();
      await expect(featured(page)).toContainText(oldest.titleName, {
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(rowIn(group(page), fallback)).toBeVisible();
    await expect(rowIn(group(page), middle)).toBeVisible();
    await expect(group(page).locator("li")).toHaveCount(2);
  });
});
