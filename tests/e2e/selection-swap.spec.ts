import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { HOLD_MS } from "@/app/(signed-in)/library/use-hold-to-select";
import { seedFixtureSession } from "./support/fixture-session";
import { seedWatchingShow, type SeededTitle } from "./support/fixture-library";
import { toStorageState } from "./support/storage-state";

/**
 * Issue #334's one browser property, named by the spec's (#326) Testing Decisions as the
 * sole thing in the whole spec no static sweep can prove: that the tab bar is `inert` from
 * the instant selection becomes active, not from the end of the fade that replaces the old
 * instant `display: none` cut. `tests/nav-transitions.test.ts` already proves the CSS
 * declares the crossfade and that `tab-bar.tsx` sets `inert` off the same `data-selecting`
 * attribute the CSS reacts to — what neither of those static reads can prove is the
 * *order*: that the attribute write, the `MutationObserver` callback and the first frame of
 * the CSS transition land in that sequence in a real browser, rather than the fade painting
 * a frame or two before `inert` catches up.
 *
 * ── The signal: `transitionrun`, not a wait ───────────────────────────────────────────
 *
 * A fixed wait would race that ordering instead of observing it, the same reasoning
 * `navigation-motion.spec.ts` gives for timing off `animationstart` rather than a duration.
 * `transitionrun` is the event the browser raises the instant a CSS transition is created —
 * during the same "update the rendering" step that recalculates style, and therefore before
 * that frame's paint — so reading `inert` from inside its handler is a read of the exact
 * moment the acceptance criteria are about. If the guarantee ever moved to, say, a
 * `requestAnimationFrame` callback instead of the synchronous `MutationObserver` it is
 * today, that callback runs *after* this event in the same frame's processing order, and
 * this test would catch the regression; a wall-clock wait sampled after the fact could not
 * tell the two apart.
 */

declare global {
  interface Window {
    __tabBarInertAtTransitionRun?: boolean | null;
    __tabBarDisplayAtTransitionRun?: string | null;
    __searchLinkFocusedMidFade?: boolean | null;
  }
}

/**
 * Installed after the page has settled and before the hold that is meant to trigger the
 * swap — the same ordering `poster-morph.spec.ts`'s own patch uses for the identical
 * reason: the browser has to be watching before the mutation happens, not polled after.
 */
async function watchTabBarGoInert(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__tabBarInertAtTransitionRun = null;
    window.__tabBarDisplayAtTransitionRun = null;
    window.__searchLinkFocusedMidFade = null;

    document.addEventListener(
      "transitionrun",
      (event) => {
        const target = event.target as HTMLElement;
        if (
          event.propertyName !== "opacity" ||
          !target.classList?.contains("phone-tab-bar") ||
          window.__tabBarInertAtTransitionRun !== null
        ) {
          return;
        }

        // Read in the same tick the transition itself was created in — before this
        // frame has painted anything.
        window.__tabBarInertAtTransitionRun = target.inert;
        window.__tabBarDisplayAtTransitionRun = getComputedStyle(target).display;

        // `inert` unfocusable is one of the guarantee's spec-defined effects, and one a
        // real browser has to actually enforce rather than merely report — a control
        // this is false for is a control still reachable by a keyboard or a screen
        // reader's own navigation.
        const searchLink = target.querySelector<HTMLAnchorElement>('a[href="/search"]');
        searchLink?.focus();
        window.__searchLinkFocusedMidFade = document.activeElement === searchLink;
      },
      true,
    );
  });
}

let seeded: SeededTitle;

test.beforeAll(async () => {
  const session = await seedFixtureSession();
  seeded = await seedWatchingShow(session.userId);

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, "selection-swap-session.json"),
    JSON.stringify(toStorageState(session), null, 2),
  );
});

test.use({ storageState: path.join(__dirname, ".auth", "selection-swap-session.json") });

test.beforeEach(async ({ page }) => {
  // Phone-only surface, the same 500×721 `poster-morph.spec.ts` standardises on:
  // `selectable-entry.tsx`'s `DESKTOP_BREAKPOINT` (1024px) is what gives the hold below a
  // *selection* to land in at all — at `lg` and up the same press selects the desktop pane
  // instead, and the tab bar this test races is `lg:hidden` and never rendered.
  await page.setViewportSize({ width: 500, height: 721 });
});

test("the tab bar is inert the instant selection starts, not from the end of the fade", async ({
  page,
}) => {
  await page.goto("/library");
  const cell = page.getByRole("button", { name: new RegExp(seeded.titleName) });
  await expect(cell).toBeVisible();

  await watchTabBarGoInert(page);

  // A held press, not a click — `use-hold-to-select.ts`'s gesture lands on the finger
  // staying down for `HOLD_MS`, not on release, so the wait happens between `down` and
  // `up` and the mouse never moves once it is down (well inside `HOLD_SLOP_PX`).
  const box = await cell.boundingBox();
  expect(box, `no bounding box for the seeded cell "${seeded.titleName}"`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS + 150);
  await page.mouse.up();

  // Filtered by text, not by accessible name. `status` is not a name-from-content role —
  // `selection-action-bar.tsx` renders a bare `<p role="status">6 selected</p>`, whose
  // accessible name is empty because nothing labels it, so `{ name: /selected/ }` matched
  // nothing however well the swap worked. The count line is the thing to wait on, and its
  // text is what identifies it.
  await expect(page.getByRole("status").filter({ hasText: /\d+ selected/ })).toBeVisible();

  const [inertAtRun, displayAtRun, searchFocused] = await page.evaluate(() => [
    window.__tabBarInertAtTransitionRun,
    window.__tabBarDisplayAtTransitionRun,
    window.__searchLinkFocusedMidFade,
  ]);

  expect(
    inertAtRun,
    "The tab bar's opacity transition never ran at all — either the crossfade regressed " +
      "to the old instant display:none cut, or the hold gesture never landed a selection.",
  ).not.toBeNull();

  expect(
    displayAtRun,
    "The tab bar was already display:none by the time its own leaving transition started " +
      "running, which means there was no visible fade for the inert guarantee to need to " +
      "race in the first place.",
  ).not.toBe("none");

  expect(
    inertAtRun,
    "The tab bar's leaving transition had already started running while `inert` was still " +
      "false — the four navigation controls were visible, in flow, and reachable by a " +
      "screen reader mid-fade, which is exactly the regression issue #334 exists to close.",
  ).toBe(true);

  expect(
    searchFocused,
    "The Search tab accepted focus while the bar was still visibly mid-fade — `inert` did " +
      "not make the four destinations unreachable in time.",
  ).toBe(false);

  // The resting state is still `display: none`, once the swap has actually finished —
  // `nav-transitions.test.ts` proves the stylesheet says so; this proves a real browser
  // gets there.
  await expect(page.locator(".phone-tab-bar")).toBeHidden();
});
