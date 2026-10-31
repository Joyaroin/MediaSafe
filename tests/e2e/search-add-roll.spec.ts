import { expect, test } from "@playwright/test";

/**
 * Issue #443 — the search row's add confirmation rolls in rather than teleporting into the
 * pills' place, and a lost add returns the pills through the same roll.
 *
 * `one-app.spec.ts`'s own search test is the reason this reaches the live catalogue rather
 * than a fixture: the screen's whole job is a title this account does not already hold, and
 * a Server Action is not a seam Playwright can intercept and answer with a fake RSC payload
 * the way `pending-hold.spec.ts` fakes a plain `fetch`. Same guard, same reason —
 * unprovable without a real `TMDB_READ_ACCESS_TOKEN`, not failing for it.
 *
 * Two titles, not one: the suite shares one fixture account
 * (`playwright.config.ts`'s default `storageState`), so the successful add in the first
 * test must not leave the second test's title already held.
 *
 * `page.getByRole("main")`, not `page.getByText` or `page.getByLabel` on `page` directly:
 * for ~300ms after a load, React's streamed copy of the page waits in a hidden `#S:0` div
 * that those two still count. `one-app.spec.ts` names the same trap.
 */

test.skip(
  (process.env.TMDB_READ_ACCESS_TOKEN ?? "test-").startsWith("test-"),
  "needs a real TMDB_READ_ACCESS_TOKEN",
);

async function searchRow(page: import("@playwright/test").Page, name: string, query: string) {
  const main = page.getByRole("main");
  await main.getByLabel("Search films and shows").fill(query);

  const row = main
    .locator("li", { has: page.getByRole("heading", { name, exact: true }) })
    .first();
  await expect(row).toBeVisible();
  return row;
}

test("adding a result rolls the pills into In your library", async ({ page }) => {
  await page.goto("/search");
  const row = await searchRow(page, "Severance", "Severance");

  const add = row.getByRole("button", { name: "Add Severance to your library" });
  await expect(add).toBeVisible();

  await add.click();

  // Mid-roll: the outgoing pill and the incoming confirmation are both on screen at once —
  // `Roll` draws the leaving copy and the arriving one in the same beat, never a cut from
  // one straight to the other.
  const outgoing = row.locator(".roll-out", { hasText: "Add" });
  const incoming = row.locator(".roll-in", { hasText: "In your library" });
  await expect(outgoing).toHaveCount(1);
  await expect(incoming).toHaveCount(1);
  expect(await incoming.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "roll-in",
  );

  // Landed: the pill is gone, and the row says so once — not a disabled Add standing
  // beside it.
  await expect(row.getByRole("button", { name: /^Add/ })).toHaveCount(0);
  await expect(
    row.getByRole("link", { name: "Severance is in your library — open it" }),
  ).toBeVisible();
});

test("a lost add rolls the pills back, through the same roll", async ({ page }) => {
  await page.goto("/search");
  const row = await searchRow(page, "Arrival", "Arrival 2016");

  // Every Server Action fails on the wire, as `up-next-motion.spec.ts` already does it for
  // the mark — the add is lost exactly as it would be offline.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort()
      : route.continue(),
  );

  const add = row.getByRole("button", { name: "Add Arrival to your library" });
  await add.click();

  // The optimistic half still happens — the row says *In your library* before the server
  // has answered, rolling in exactly as the landed add does.
  await expect(
    row.getByRole("link", { name: "Arrival is in your library — open it" }),
  ).toBeVisible();

  // The write-failure toast — unchanged by this ticket, and still the one way a lost write
  // is reported.
  await expect(page.getByRole("alert").getByText("That did not save")).toBeVisible();

  // The rollback rolls too: the outgoing confirmation and the incoming pill are both on
  // screen at once, not a cut straight back to *Add*.
  const outgoing = row.locator(".roll-out", { hasText: "In your library" });
  const incoming = row.locator(".roll-in").filter({
    has: page.getByRole("button", { name: "Add Arrival to your library" }),
  });
  await expect(outgoing).toHaveCount(1);
  await expect(incoming).toHaveCount(1);

  await expect(row.getByRole("button", { name: "Add Arrival to your library" })).toBeVisible();
  await expect(
    row.getByRole("link", { name: "Arrival is in your library — open it" }),
  ).toHaveCount(0);
});
