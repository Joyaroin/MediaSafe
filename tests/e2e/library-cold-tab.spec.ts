import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, seedWatchlistFilms } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #453 — Library remembers its tab on the server too. `localStorage` alone means
 * the server always renders Shows, so a cold load (a reload, a phone home screen) used
 * to paint Shows and switch to the remembered tab only once the client corrected it.
 * `keepLibraryView` now writes a cookie alongside `localStorage`, and `LibraryPage`
 * resolves `?view=` → cookie → default before it ever renders.
 *
 * Its own fixture account, for `one-app.spec.ts`'s reason: this needs a library with a
 * show *and* a film in it, at a desktop size where the Shows/Films/Lists control is
 * always on screen.
 */

const DESKTOP = { width: 1280, height: 900 };

let showName: string;
let filmName: string;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  const show = await seedWatchingShow(session.userId);
  const [film] = await seedWatchlistFilms(session.userId, 1);
  showName = show.titleName;
  filmName = film;

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "library-cold-tab-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "library-cold-tab-session.json") });

test("choosing Films is remembered across a reload, with no Shows frame first", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);

  // A MutationObserver armed before the first byte of the reload arrives — the kind of
  // sub-400ms state this suite records with an observer rather than polling for after the
  // fact, since polling would miss a flash entirely. It watches for the show's name
  // anywhere in the visible DOM, which is what Shows mode renders and Films mode never
  // does.
  await page.addInitScript((marker: string) => {
    (window as unknown as { __sawShowFrame: boolean }).__sawShowFrame = false;
    const check = () => {
      if (document.body && document.body.innerText.includes(marker)) {
        (window as unknown as { __sawShowFrame: boolean }).__sawShowFrame = true;
      }
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("DOMContentLoaded", check);
  }, showName);

  await page.goto("/library");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: showName, exact: false })).toBeVisible();

  // Choose Films — this writes the cookie (and localStorage) via `keepLibraryView`.
  await main.getByRole("button", { name: "Films", exact: true }).click();
  await expect(main.getByRole("button", { name: filmName, exact: false })).toBeVisible();
  await expect(main.getByRole("button", { name: showName, exact: false })).toHaveCount(0);

  // The reload this ticket is about. The observer armed above is watching the whole way
  // through it.
  await page.reload();

  await expect(main.getByRole("button", { name: filmName, exact: false })).toBeVisible();
  await expect(main.getByRole("button", { name: "Films", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page.evaluate(() => (window as unknown as { __sawShowFrame: boolean }).__sawShowFrame),
  ).toBe(false);
});

test("a `?view=lists` link wins over a cookie that remembers Films", async ({ page }) => {
  await page.setViewportSize(DESKTOP);

  await page.goto("/library");
  const main = page.getByRole("main");

  // Remember Films on this device first, the same way the previous test does.
  await main.getByRole("button", { name: "Films", exact: true }).click();
  await expect(main.getByRole("button", { name: "Films", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.goto("/library?view=lists");
  await expect(main.getByRole("textbox", { name: /list/i })).toBeVisible();
  await expect(main.getByRole("button", { name: "Lists", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
