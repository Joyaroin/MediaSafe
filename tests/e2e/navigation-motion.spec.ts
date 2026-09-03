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

  /**
   * **Waited for, not sampled — and the distinction is the whole of this block.**
   *
   * `nav-fade` runs on `::view-transition-new(root)`, whose `animationstart` fires once the
   * transition is ready, which is *after* the DOM update that reveals the marker above. So
   * the marker being visible does not mean the animation has begun: reading the timing at
   * that instant races a gap that is near zero on a fast machine and wide enough on a slow
   * one to read `null` for a motion that ran perfectly. That is what it did — this passed
   * locally and failed in CI against a build where the property held.
   *
   * A single sample cannot tell *has not started yet* from *never started*. Polling to a
   * timeout can, and only the timeout means the motion is genuinely absent.
   */
  const started = await page
    .waitForFunction(() => window.__navFadeElapsedMs !== null, undefined, { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  const elapsedMs = await page.evaluate(() => window.__navFadeElapsedMs);

  /**
   * The diagnostics ride along with the failure rather than being reconstructed from a
   * trace afterwards — #305's own acceptance criterion is that a failure names *which*
   * property broke, and "never ran" has three quite different causes worth telling apart:
   * the browser asking for reduced motion (where the application drops the animation on
   * purpose), a transition the browser skipped, and one that never started at all.
   */
  const diagnostics = await page.evaluate(() => ({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    viewTransitions: typeof document.startViewTransition === "function",
    path: location.pathname,
  }));

  expect(
    started,
    "The navigation's motion (`nav-fade`) never started at all after the press — the root " +
      `cross-fade this property depends on never ran. ${JSON.stringify(diagnostics)}`,
  ).toBe(true);

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
