import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedShowWithSeason, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #440 — the title page's *N of M* season count rolls when an episode is marked,
 * the way it already does on Tonight (`tests/e2e/up-next-motion.spec.ts`,
 * `tests/motion-moments.test.ts`). The roll is the existing `Roll` (`app/roll.tsx`) —
 * `tests/title-page.test.ts` holds that as a static fact about the markup; this is the
 * one thing only a browser shows, that the outgoing and incoming lines are genuinely both
 * on screen together while the roll plays, in the same beat as the bar's own fill.
 *
 * The roll's duration (`--dur-roll`) is stretched here by an injected style, not a code
 * change, so the mid-roll moment is wide enough to observe without racing the real 280ms.
 *
 * Its own fixture account, for the same reason every other `seedFixtureSession` spec takes
 * one: the shared account must stay empty for the specs that rely on that.
 */

let show: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  // Four aired episodes, the first watched: the hero opens on "1 of 4 · Season 1".
  show = await seedShowWithSeason(session.userId, { episodes: 4, watched: [1] });

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "title-count-roll-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "title-count-roll-session.json") });

test("marking an episode rolls the season count, outgoing and incoming lines both on screen mid-roll", async ({
  page,
}) => {
  await page.goto(`/titles/${show.libraryEntryId}`);

  // Through `main` by role, not a label or text lookup on `page`: for a moment after a
  // load React's streamed copy of the page waits in a hidden `#S:0` div, and that copy
  // would otherwise be found too (`one-app.spec.ts`).
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: show.titleName })).toBeVisible();
  await expect(main).toContainText("1 of 4 · Season 1");

  const fill = main.locator(".progress-fill");
  await expect(fill).toHaveAttribute("style", /translateX\(-75%\)/);

  // Stretched so both lines of the roll are reliably on screen at once below, rather than
  // the test racing the real --dur-roll (280ms, `tests/motion-moments.test.ts`).
  await page.addStyleTag({ content: ".roll-out, .roll-in { animation-duration: 3s !important; }" });

  await main.getByRole("button", { name: /^Mark .* watched$/ }).click();

  const outgoing = main.locator(".roll-out", { hasText: "1 of 4" });
  const incoming = main.locator(".roll-in", { hasText: "2 of 4" });
  await expect(outgoing).toBeVisible();
  await expect(incoming).toBeVisible();

  // The bar's own fill moved in the same beat as the roll — one mark, one render, both
  // starting together, rather than the roll waiting on a second signal.
  await expect(fill).toHaveAttribute("style", /translateX\(-50%\)/);

  // The season heading beside the count was not part of what rolled: it never left. The
  // "·" distinguishes this from the episode list's own "Season 1" chip further down.
  await expect(main.getByText("· Season 1", { exact: false })).toBeVisible();

  // The roll finishes and settles on the new count.
  await expect(outgoing).toHaveCount(0);
  await expect(main).toContainText("2 of 4 · Season 1");
});
