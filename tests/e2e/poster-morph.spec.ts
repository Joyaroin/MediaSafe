import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #305's first property: the poster morph (#303) pairs a source and a destination
 * under one `view-transition-name` — the library grid cell or an Up next row on one side,
 * `titles/[entryId]/pending-poster.tsx` on the other — rather than being skipped, which is
 * what both entry paths did until #303 fixed them for two different reasons (the grid cell
 * minted no name at all; the pending frame replaced the poster with bars before a named
 * destination ever mounted). One test per path, so a regression on either is caught on its
 * own rather than one green test covering for the other.
 *
 * ── Its own fixture account, not the shared one ───────────────────────────────────────
 *
 * `global-setup.ts` seeds the one account `pending-hold.spec.ts` depends on carrying **no**
 * library entries. These two tests need the opposite — a title genuinely in the library and
 * genuinely on Up next — so this file mints and signs in as a second account of its own
 * (`test.use({ storageState })` below), rather than writing rows onto the account another
 * file's assertion already depends on being empty.
 *
 * ── Why a real browser signal, not a duration ─────────────────────────────────────────
 *
 * "Paired" is a fact about the browser's own View Transition: the outgoing element and the
 * incoming one share a `view-transition-name`, so the browser generates **both**
 * `::view-transition-old(name)` and `::view-transition-new(name)` pseudo-elements inside one
 * `::view-transition-group(name)`. A skipped morph produces at most one side of that pair —
 * the tile fades out on its own, or the destination fades in on its own, and nothing travels
 * between them. `document.getAnimations()` is specified to include pseudo-element animations
 * (`web.dev`'s own view-transitions guidance queries it exactly this way), so patching
 * `document.startViewTransition` to inspect it at `ready` — the point the spec defines as
 * "the pseudo-element tree is created and the transition is about to start animating" — is a
 * read of the real browser state a navigation produced, not a poll or a timer racing CI.
 */

declare global {
  interface Window {
    __morphObservations?: { hasOld: boolean; hasNew: boolean }[];
  }
}

/**
 * Patches `document.startViewTransition` so every transition the next click triggers is
 * inspected for `name`'s pair. Installed after the page has settled and before the click
 * that is meant to trigger one — the same ordering `pending-hold.spec.ts` uses for its own
 * `animationstart` listener, for the same reason: the patch has to be in place before the
 * event it is meant to observe can fire.
 */
async function watchForMorphPair(page: Page, name: string): Promise<void> {
  await page.evaluate((transitionName) => {
    window.__morphObservations = [];
    const native = document.startViewTransition?.bind(document);
    if (!native) {
      throw new Error(
        "This browser exposes no document.startViewTransition — the suite requires Chromium.",
      );
    }

    document.startViewTransition = ((...args: Parameters<typeof native>) => {
      const transition = native(...args);
      transition.ready
        .then(() => {
          const animations = document.getAnimations();
          const hasOld = animations.some(
            (animation) =>
              animation.effect instanceof KeyframeEffect &&
              animation.effect.pseudoElement === `::view-transition-old(${transitionName})`,
          );
          const hasNew = animations.some(
            (animation) =>
              animation.effect instanceof KeyframeEffect &&
              animation.effect.pseudoElement === `::view-transition-new(${transitionName})`,
          );
          window.__morphObservations?.push({ hasOld, hasNew });
        })
        .catch(() => {
          // A transition the browser skips outright rejects `ready` rather than resolving
          // it — recorded as neither half showing up, which is exactly the failure this
          // suite exists to catch, not a reason to lose the observation.
          window.__morphObservations?.push({ hasOld: false, hasNew: false });
        });
      return transition;
    }) as typeof document.startViewTransition;
  }, name);
}

/** Whether any transition observed since `watchForMorphPair` carried both halves of the
 *  named pair — the morph pairing rather than being skipped. */
/**
 * **Waits for the pair rather than sampling for it, and that is the whole of this
 * helper.** Opening a title runs *two* transitions, not one: the first carries the grid
 * or row away and records an old snapshot with no new half yet, and the second is the one
 * that pairs — `::view-transition-group`, `-old` and `-new` all under the poster's name.
 *
 * The heading this spec waits on belongs to the destination, so it becomes visible while
 * that second transition is still starting. Reading the observations at that moment sees
 * only the first, reports no pair, and fails a morph that in fact ran — which is exactly
 * what this asserted before, and it failed in CI against a build where the morph was
 * working. A single sample cannot express *has not paired yet* and *did not pair*
 * separately; polling until the timeout can, and the timeout is the only thing that means
 * the morph is genuinely absent.
 */
async function morphPaired(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => window.__morphObservations?.some((o) => o.hasOld && o.hasNew) ?? false,
      undefined,
      { timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * What the failure gets to say, gathered at the moment it failed rather than reconstructed
 * from a trace afterwards. #305's acceptance criterion is that a failure names which
 * property broke and on which path, and *no pair* has several quite different causes: the
 * browser asking for reduced motion, where the application drops the morph on purpose; a
 * source name that was never minted; a destination that never mounted; or a transition
 * that ran and paired nothing. The observations tell those apart, and the names present at
 * the end say which half of the pair was missing.
 */
async function morphDiagnostics(page: Page, transitionName: string): Promise<string> {
  return JSON.stringify(
    await page.evaluate((name) => {
      const named = [...document.querySelectorAll<HTMLElement>("*")]
        .map((el) => getComputedStyle(el).viewTransitionName)
        .filter((n) => n && n !== "none");
      return {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        observations: window.__morphObservations ?? null,
        expected: name,
        namesOnDestination: named,
        path: location.pathname,
      };
    }, transitionName),
  );
}

let seeded: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  seeded = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "poster-morph-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "poster-morph-session.json") });

test.beforeEach(async ({ page }) => {
  /**
   * Narrow enough to take the phone path on both entry surfaces. `selectable-entry.tsx`'s
   * `DESKTOP_BREAKPOINT` (`1024px`) decides whether a library tap selects in place or pushes
   * a route, and `app/(signed-in)/up-next/page.tsx` gates its phone rail behind `lg:hidden`
   * the same way — below `1024px` both paths actually navigate to `/titles/{id}`, which is
   * the one case the morph exists for. `500×721` is not an arbitrary phone size: it is the
   * exact viewport `SPEC.md`'s Further Notes records the problem statement's own
   * measurements against.
   */
  await page.setViewportSize({ width: 500, height: 721 });
});

test("the poster morph pairs when opening a title from the library grid", async ({ page }) => {
  const transitionName = `rail-poster-${seeded.libraryEntryId}`;

  await page.goto("/library");
  await watchForMorphPair(page, transitionName);

  await page.getByRole("button", { name: new RegExp(seeded.titleName) }).click();
  await expect(page.getByRole("heading", { name: seeded.titleName, level: 2 })).toBeVisible();

  expect(
    await morphPaired(page),
    `The poster morph did not pair opening "${seeded.titleName}" from the library grid: ` +
      `no view transition carried both an old and a new "${transitionName}" — either the ` +
      "grid cell minted no source name, or the pending frame mounted no destination for it. " +
      (await morphDiagnostics(page, transitionName)),
  ).toBe(true);
});

test("the poster morph pairs when opening a title from an Up next row", async ({ page }) => {
  const transitionName = `rail-poster-${seeded.libraryEntryId}`;

  await page.goto("/up-next");
  await watchForMorphPair(page, transitionName);

  await page.getByRole("link", { name: new RegExp(seeded.titleName) }).click();
  await expect(page.getByRole("heading", { name: seeded.titleName, level: 2 })).toBeVisible();

  expect(
    await morphPaired(page),
    `The poster morph did not pair opening "${seeded.titleName}" from an Up next row: ` +
      `no view transition carried both an old and a new "${transitionName}" — either the ` +
      "row minted no source name, or the pending frame mounted no destination for it. " +
      (await morphDiagnostics(page, transitionName)),
  ).toBe(true);
});

/**
 * **Issue #320's own property: the morph pairs like with like.** The three tests above
 * prove the transition *runs* — both an old and a new snapshot under the shared name — but
 * say nothing about what either snapshot looks like. Before #320 the Up next row drew the
 * episode's still at `16:9` and the title's own page always drew its poster at `2:3`, so
 * every one of those transitions above was already pairing two different shapes; it ran and
 * still looked wrong, which no observation of `document.getAnimations()` alone can catch.
 *
 * `seedWatchingShow` mints episodes with no `stillPath` at all, so this fixture already
 * exercised the bug on every run of the suite above without any test noticing: `cardPicture`
 * fell back to the poster even before #320, and the row cropped it into the `16:9` box
 * regardless. This test is the one that would have failed against that build — not on
 * whether the transition ran, but on whether the two ends agreed on a shape.
 */
test("the poster morph pairs the row's picture and the title's poster at one ratio", async ({
  page,
}) => {
  await page.goto("/up-next");

  const rowPicture = page.locator('img[src*="image.tmdb.org"]').first();
  await expect(rowPicture).toBeVisible();
  const rowBox = await rowPicture.boundingBox();
  expect(rowBox, "the Up next row draws no TMDB image at all").not.toBeNull();

  await page.getByRole("link", { name: new RegExp(seeded.titleName) }).click();
  await expect(page.getByRole("heading", { name: seeded.titleName, level: 2 })).toBeVisible();

  const destinationPicture = page.locator('img[src*="image.tmdb.org"]').first();
  await expect(destinationPicture).toBeVisible();
  const destinationBox = await destinationPicture.boundingBox();
  expect(destinationBox, "the title's own page draws no TMDB image at all").not.toBeNull();

  const rowRatio = rowBox!.width / rowBox!.height;
  const destinationRatio = destinationBox!.width / destinationBox!.height;

  // Both ends of the morph are the poster's own `2/3`, never the row's former `16/9` still
  // — the property the morph repair depends on: the shared element travels as one picture
  // at one shape rather than two mismatched ones.
  expect(rowRatio).toBeCloseTo(2 / 3, 1);
  expect(destinationRatio).toBeCloseTo(2 / 3, 1);
});

/**
 * **The single-commit path, which is the one that shipped broken — issue #305.**
 *
 * The two tests above open a title the router has never fetched, so React renders the
 * pending frame first and the navigation is two commits: grid → pending → content. That
 * hid a real defect for a whole ticket, because the morph's destination name lived only on
 * the pending frame, and the pending frame is exactly what a two-commit navigation
 * guarantees.
 *
 * Opening the same title a second time resolves from the router's own cache in **one**
 * commit, the pending frame never renders, and until `title-hero.tsx` carried a raw name of
 * its own there was no destination to travel to — `{hasOld: true, hasNew: false}`, the
 * morph silently skipped. It is the ordinary case in real use: open a title, go back, open
 * it again.
 *
 * CI took this path every time while a developer's machine took the other one, so the suite
 * passed locally and failed on the runner against the same commit. This test is what makes
 * that difference an assertion rather than a coincidence of timing.
 */
test("the poster morph pairs on a second opening, from the router's own cache", async ({
  page,
}) => {
  const transitionName = `rail-poster-${seeded.libraryEntryId}`;

  await page.goto("/library");
  await page.getByRole("button", { name: new RegExp(seeded.titleName) }).click();
  await expect(page.getByRole("heading", { name: seeded.titleName, level: 2 })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("button", { name: new RegExp(seeded.titleName) })).toBeVisible();

  // Only now, so the observation is of the second navigation and not the first.
  await watchForMorphPair(page, transitionName);
  await page.getByRole("button", { name: new RegExp(seeded.titleName) }).click();
  await expect(page.getByRole("heading", { name: seeded.titleName, level: 2 })).toBeVisible();

  expect(
    await morphPaired(page),
    `The poster morph did not pair reopening "${seeded.titleName}" from the router's cache: ` +
      `no view transition carried both an old and a new "${transitionName}". This is the ` +
      "single-commit path — no pending frame renders, so the destination's own name is the " +
      "only thing that can carry the morph. " + (await morphDiagnostics(page, transitionName)),
  ).toBe(true);
});
