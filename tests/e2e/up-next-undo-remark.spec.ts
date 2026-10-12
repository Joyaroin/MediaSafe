import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * A regression from #367's hold-over (`hold-over.tsx`): mark an episode, press Undo, and
 * press the check again straight away. The Undo's write resolved before the router had
 * drawn its re-render, `HoldOver` let go in that gap, and the card was briefly drawn from
 * the *mark's* render — whose run starts one episode later. The check under the thumb
 * still said episode 2 but recorded episode 3, which here was the season's last, so the
 * show finished and left Up next.
 *
 * Two shows, because that is what reproduced it; one show did not.
 */

let latest: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });
  latest = await seedShowWithSeason(session.userId, { episodes: 3, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "up-next-undo-remark-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "up-next-undo-remark-session.json") });

/** The show's row on Tonight, or — when it is the show watched most recently — the featured
 *  block (Charcoal, issue #400), which carries the same title link and the same controls. */
const card = (page: Page) =>
  page.locator("li, [data-featured]", {
    has: page.getByRole("link", { name: new RegExp(latest.titleName) }),
  });

test("marking again straight after an Undo records the episode the check names", async ({
  page,
}) => {
  const marked: string[] = [];
  page.on("request", (request) => {
    const body = request.method() === "POST" ? (request.postData() ?? "") : "";
    if (body.includes('"sourceKey"')) marked.push(body);
  });

  await page.goto("/up-next");
  const episode2 = card(page).getByRole("button", { name: /^Mark .*, Season 1, Episode 2 — / });

  await episode2.click();
  await card(page).getByRole("button", { name: /^Undo marking/ }).click();
  await expect(episode2).toBeVisible();
  await episode2.click();

  // Everything settled, from the server: episode 2 is watched, episode 3 is not, so the
  // show is still on Up next offering episode 3.
  await expect.poll(() => marked.length).toBe(2);
  await page.waitForTimeout(2_000);
  await page.reload();
  await expect(card(page).getByRole("button", { name: /^Mark .*, Season 1, Episode 3 — / })).toBeVisible();
});
