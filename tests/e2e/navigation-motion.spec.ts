import { expect, test, type Page } from "@playwright/test";

/**
 * Issue #305's third property, and the one the spec (#300) calls "the property the whole
 * specification exists to restore": the navigation's motion — `app/globals.css`'s root
 * cross-fade, `nav-fade`/`nav-rise` on `::view-transition-old(root)`/
 * `::view-transition-new(root)` — has to begin in the tens of milliseconds after the press,
 * not hundreds of milliseconds later against a skeleton swap the reader did not cause.
 * Measured on production before the fix (#300's problem statement): the transition started
 * 367–370ms after a tab press, because it was animating the pending skeleton swapping for
 * real content rather than the press itself. `pending-hold.spec.ts` (#304) already proves
 * the pending bars themselves never paint on a fast navigation; this proves the motion that
 * replaces them starts on the press, which is the fact the reader actually experiences.
 *
 * ── The signal: `animationstart`, not a duration ──────────────────────────────────────
 *
 * `pending-hold.spec.ts`'s own docblock has the reasoning, applied here to a second
 * keyframe: a poll or a fixed wait races CI's own variance, and the browser already raises
 * `animationstart` at the exact moment an animation begins. `nav-fade` is the animation
 * both `::view-transition-old(root)`'s and `::view-transition-new(root)`'s declarations
 * name, so listening for it — rather than for `nav-rise`, which only the entering side
 * carries — catches whichever pseudo-element the browser starts first.
 *
 * ── Why the click is timestamped in the browser, not in Node ─────────────────────────
 *
 * `performance.now()` inside a capturing `click` listener records the instant the press was
 * actually dispatched to the page; timing `page.click()` from the Node side would fold in
 * whatever latency sits between Playwright's process and the browser's own event loop, which
 * is not the interval this property is about.
 */

declare global {
  interface Window {
    __navFadeElapsedMs?: number | null;
  }
}

/** Records `performance.now()` at the press, then again at `nav-fade`'s `animationstart` —
 *  installed before the click it is meant to time. */
async function watchNavFadeTiming(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__navFadeElapsedMs = null;
    let pressedAt: number | null = null;

    document.addEventListener(
      "click",
      () => {
        pressedAt = performance.now();
      },
      true,
    );

    document.addEventListener(
      "animationstart",
      (event) => {
        if (
          event.animationName === "nav-fade" &&
          pressedAt !== null &&
          window.__navFadeElapsedMs === null
        ) {
          window.__navFadeElapsedMs = performance.now() - pressedAt;
        }
      },
      true,
    );
  });
}

/**
 * Well under "hundreds of milliseconds" — the failure mode this test exists to catch — and
 * a wide margin above the tens-of-milliseconds path a fast navigation now takes, so the
 * assertion is never a race against CI's own variance. `#300`'s production table has the
 * unfixed numbers this bounds against: 367–370ms.
 */
const HUNDREDS_OF_MILLISECONDS = 250;

// Same disambiguation `pending-hold.spec.ts` uses: `sidebar-nav.tsx`'s desktop `<aside>`
// carries this label too, and only its own ancestor tells the two navs apart.
const libraryLink = (page: Page) =>
  page.locator('aside nav[aria-label="Primary"] a[href="/library"]');
const emptyLibraryMarker = (page: Page) => page.getByText("The bill is blank");

test("the navigation's motion begins against the press, not hundreds of milliseconds later", async ({
  page,
}) => {
  await page.goto("/up-next");
  await watchNavFadeTiming(page);

  await libraryLink(page).click();
  await expect(emptyLibraryMarker(page)).toBeVisible();

  const elapsedMs = await page.evaluate(() => window.__navFadeElapsedMs);

  expect(
    elapsedMs,
    "The navigation's motion (`nav-fade`) never started at all after the press — the root " +
      "cross-fade this property depends on never ran.",
  ).not.toBeNull();

  expect(
    elapsedMs,
    `The navigation's motion began ${elapsedMs}ms after the press. The property this ` +
      "ticket exists to restore is that it begins in the tens of milliseconds against the " +
      "press, not hundreds of milliseconds later against a skeleton swap the reader did " +
      "not cause.",
  ).toBeLessThan(HUNDREDS_OF_MILLISECONDS);
});
