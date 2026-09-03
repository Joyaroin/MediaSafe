import { expect, test, type Page } from "@playwright/test";

/**
 * Issue #304 — the first of the three browser-only properties `SPEC.md`'s Testing
 * Decisions name, and the only one this ticket builds: that a navigation resolving
 * faster than `--dur-pending-hold` paints no pending bars, and that the delay is not
 * proven by simply deleting the pending stage — a navigation slower than the hold still
 * has to show it.
 *
 * ── What "paints no pending bars" means, and how it is caught ────────────────────────
 *
 * `app/globals.css`'s `route-pending-hold` utility (issue #301) never toggles
 * `display`: the held `<div role="status" class="pending route-pending-hold">` is opacity
 * `0` from the instant it mounts, and only becomes visible when its `route-pending-reveal`
 * keyframe actually starts — which, per the CSS spec, a browser fires an `animationstart`
 * event for at the moment the animation begins, i.e. once `--dur-pending-hold` has
 * elapsed. A navigation that resolves and unmounts that node first cancels the animation
 * before it ever starts, so `animationstart` never fires at all — nothing here polls
 * opacity or races a timer against the network; it listens for the one DOM event the
 * browser itself only raises when the bars would have become visible.
 *
 * ── Why Up next → Library, and why it is real navigation rather than a mock ───────────
 *
 * Both are radius-1 `loading.tsx` boundaries (`DESIGN.md` §9) reachable from the sidebar
 * without a click through any intermediate screen. The fixture account carries no library
 * entries, so `/library` resolves to `EmptyLibrary` ("The bill is blank") once the read
 * completes — a marker that only ever paints once the navigation is genuinely finished,
 * on a real seeded account behind a minted session, against the real route the reader's
 * own browser would hit.
 */

declare global {
  interface Window {
    __pendingRevealed?: boolean;
  }
}

/** Sets a flag the moment the held pending line's hold actually elapses — see the file
 *  docblock. Installed before the navigation that is meant to trigger, or not trigger,
 *  it. */
async function watchForRevealedPending(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__pendingRevealed = false;
    document.addEventListener(
      "animationstart",
      (event) => {
        if (event.animationName === "route-pending-reveal") {
          window.__pendingRevealed = true;
        }
      },
      true,
    );
  });
}

/**
 * Delays the client-side navigation fetch to `/library` — the `rsc` header Next's own
 * router sends (`node_modules/next/dist/client/components/app-router-headers.js`) — well
 * past `--dur-pending-hold` (300ms), without touching a single line of application code.
 *
 * ── Scoped to `/library`, not every request ───────────────────────────────────────────
 *
 * The sidebar carries five other destinations, each prefetched the moment `/up-next`
 * mounts. A first version of this delayed every `rsc` request, on the reasoning that
 * only `/library`'s traffic matters — which is true of what the assertion reads, but not
 * of what shares the wire with it: `next start` serves HTTP/1.1, capped at six
 * connections per origin in Chromium, and holding five unrelated prefetches open for
 * `delayMs` each was enough to queue the one request this test actually cares about
 * behind them. Narrowing the route to `/library` leaves that traffic to resolve at its
 * own speed and delays only the fetch under test.
 *
 * ── The prefetch is left alone; only the click's own fetch is delayed ────────────────
 *
 * `next-router-prefetch` marks the background request the sidebar link fires the moment
 * it enters the viewport, carrying the static shell up to and including `loading.tsx` for
 * a `force-dynamic` route — it is what lets the router paint the pending state the
 * instant a click resolves a distinct segment, before any dynamic data has come back at
 * all. A first version of this delayed that request too, on the same header both share
 * (`rsc: 1`), and the effect was not "the pending state also arrives 600ms late" — it was
 * that the router had nothing telling it there was a boundary to paint until *something*
 * came back, so the pending state's own appearance moved with the delay instead of
 * staying pinned to the click, and the two sometimes closed on the hold window from the
 * same side. Leaving the prefetch to resolve at its own (fast, local) speed and delaying
 * only the request that carries no `next-router-prefetch` header reproduces what a slow
 * connection actually looks like: the shell is ready immediately, the data is not.
 */
async function delayClientNavigations(page: Page, delayMs: number): Promise<void> {
  await page.route("**/library**", async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] === "1" && !headers["next-router-prefetch"]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

// `sidebar-nav.tsx` and `tab-bar.tsx` both label their own destinations nav
// `aria-label="Primary"` — one for desktop, one for phone, both present in the DOM at
// every viewport and told apart only by CSS. `aside` is `sidebar.tsx`'s own wrapper and
// the phone tab bar has no ancestor by that name, so it is what disambiguates the two
// without reaching for visibility, which a headless run cannot be relied on to compute
// the same way twice.
const libraryLink = (page: Page) =>
  page.locator('aside nav[aria-label="Primary"] a[href="/library"]');
const emptyLibraryMarker = (page: Page) => page.getByText("The bill is blank");

test("a navigation resolving faster than the delay paints no pending bars", async ({
  page,
}) => {
  await page.goto("/up-next");
  await watchForRevealedPending(page);

  await libraryLink(page).click();
  await expect(emptyLibraryMarker(page)).toBeVisible();

  expect(await page.evaluate(() => window.__pendingRevealed)).toBe(false);
});

test("a navigation slower than the delay does show the pending state", async ({ page }) => {
  // Slower than --dur-pending-hold's 300ms by a wide margin, so the assertion below is
  // never a race against CI's own variance.
  await delayClientNavigations(page, 1000);

  await page.goto("/up-next");
  await watchForRevealedPending(page);

  await libraryLink(page).click();
  await expect(emptyLibraryMarker(page)).toBeVisible({ timeout: 10_000 });

  expect(await page.evaluate(() => window.__pendingRevealed)).toBe(true);
});
