import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

// THROWAWAY probe for #370: per view transition, does the poster name pair, and does the
// group actually travel (first keyframe's geometry differs from the last)?

declare global {
  interface Window {
    __probe?: unknown[];
  }
}

async function install(page: Page, name: string) {
  await page.evaluate((n) => {
    window.__probe = [];
    const native = document.startViewTransition!.bind(document);
    let index = 0;
    document.startViewTransition = ((...args: Parameters<typeof native>) => {
      const i = index++;
      const t = native(...args);
      t.ready
        .then(() => {
          const anims = document.getAnimations();
          const pe = (a: Animation) =>
            a.effect instanceof KeyframeEffect ? a.effect.pseudoElement : null;
          const hasOld = anims.some((a) => pe(a) === `::view-transition-old(${n})`);
          const hasNew = anims.some((a) => pe(a) === `::view-transition-new(${n})`);
          const group = anims.find((a) => pe(a) === `::view-transition-group(${n})`);
          const frames =
            group?.effect instanceof KeyframeEffect ? group.effect.getKeyframes() : [];
          const pick = (f: Keyframe | undefined) =>
            f ? { w: f.width, h: f.height, t: f.transform } : null;
          window.__probe!.push({
            i,
            hasOld,
            hasNew,
            groupFrames: frames.length,
            first: pick(frames[0]),
            last: pick(frames[frames.length - 1]),
            path: location.pathname,
          });
        })
        .catch((e) => window.__probe!.push({ i, skipped: String(e) }));
      return t;
    }) as typeof document.startViewTransition;
  }, name);
}

let seeded: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  seeded = await seedWatchingShow(session.userId);
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "morph-probe-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "morph-probe-session.json") });

const CASES = [
  { surface: "library", width: 500, open: (p: Page) => p.getByRole("button", { name: new RegExp(seeded.titleName) }).first().click() },
  { surface: "up-next", width: 500, open: (p: Page) => p.getByRole("link", { name: new RegExp(seeded.titleName) }).first().click() },
  { surface: "you", width: 500, open: (p: Page) => p.getByRole("link", { name: new RegExp(seeded.titleName) }).first().click() },
  { surface: "up-next", width: 1280, open: (p: Page) => p.getByRole("link", { name: new RegExp(seeded.titleName) }).first().click() },
  { surface: "you", width: 1280, open: (p: Page) => p.getByRole("link", { name: new RegExp(seeded.titleName) }).first().click() },
];

for (const c of CASES) {
  for (const visit of ["first", "second"]) {
    test(`${c.surface} @${c.width} ${visit} open`, async ({ page }) => {
      const name = `rail-poster-${seeded.libraryEntryId}`;
      await page.setViewportSize({ width: c.width, height: 800 });
      await page.goto(`/${c.surface}`);
      if (visit === "second") {
        await c.open(page);
        await page.getByRole("heading", { name: seeded.titleName, level: 1 }).waitFor();
        await page.goBack();
        await page.waitForTimeout(800);
      }
      await install(page, name);
      // Slow the title page's RSC so the loading screen is guaranteed to commit first.
      await c.open(page);
      await page.getByRole("heading", { name: seeded.titleName, level: 1 }).waitFor();
      await page.waitForTimeout(1500);
      const probe = await page.evaluate(() => window.__probe);
      console.log(`PROBE ${c.surface}@${c.width} ${visit}: ${JSON.stringify(probe)}`);
    });
  }
}
