import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * The Playwright seam issue #304 adds — `SPEC.md`'s Testing Decisions name it as the one
 * seam that exists for properties only a real browser can show: that a navigation
 * resolving faster than `--dur-pending-hold` paints no pending bars, and that one slower
 * than the hold still does.
 *
 * ── Not the verify gate, and not `npm test` ───────────────────────────────────────────
 *
 * `foundry.config.json`'s `verify` array is `typecheck`, `build`, `test` — vitest,
 * matching `vitest.config.mts`'s own `include: ["tests/**\/*.test.ts"]`. This suite lives
 * under `tests/e2e/` and every spec is `*.spec.ts`, which that glob does not match, so
 * `npm test` never sees it and a browser harness never runs in every builder's parallel
 * verify pass. `npm run test:e2e` is the one command that does, documented in
 * `docs/local-development.md`.
 *
 * ── One project, one port ─────────────────────────────────────────────────────────────
 *
 * Chromium only — the three properties under test are about the pending state's own
 * timing, not about a browser engine's rendering quirks, so a second and third project
 * would triple the run for nothing this ticket asks for. Port 3100, not 3000, so this
 * never fights a `next dev` server already running on the usual port.
 */
export default defineConfig({
  testDir: path.join(__dirname, "tests/e2e"),
  testMatch: "**/*.spec.ts",
  globalSetup: path.join(__dirname, "tests/e2e/global-setup.ts"),
  /**
   * One worker, deliberately, small as this suite is today. The slow-navigation case
   * (`pending-hold.spec.ts`) proves its property by racing a real wall-clock delay
   * against `--dur-pending-hold`, and a second Chromium instance competing for the same
   * CPU measurably widens that race — verified directly: flaked under three parallel
   * workers on a loaded machine, thirty-for-thirty clean at one. A machine dedicated to
   * this one job, running two tests, has nothing worth parallelising yet.
   */
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI keeps the concise line output for the log and an HTML report on disk for
  // `.github/workflows/e2e.yml`'s artifact upload.
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3100",
    storageState: path.join(__dirname, "tests/e2e/.auth/fixture-session.json"),
    trace: "retain-on-failure",
    /**
     * **Pinned, because this whole suite is about motion and the application drops motion
     * on request.** `app/globals.css`'s `@media (prefers-reduced-motion: reduce)` block
     * zeroes `::view-transition-group`, `-old` and `-new` outright — that is §6's stated
     * contract, *the event still happens, it just stops moving through space*. A browser
     * reporting `reduce` therefore has no morph to pair and no motion to time, and every
     * assertion here fails for the one reason that is not a defect.
     *
     * It is not hypothetical. Headless Chromium on a Linux runner reports `reduce` where a
     * developer's own machine reports `no-preference`, so the three motion specs passed
     * locally and failed in CI on a build where all of them were correct. Measured with
     * both settings against the same commit: `no-preference` pairs the poster on both
     * paths, `reduce` records one transition and never pairs.
     *
     * `contextOptions` rather than a bare `reducedMotion` key: it is a browser-context
     * option in this version of Playwright and not one of `PlaywrightTestOptions`' own,
     * which is why the obvious spelling does not typecheck.
     *
     * **This pins the default, it does not forbid the other value.** A spec that wants the
     * reduced-motion path asks for it with `page.emulateMedia({ reducedMotion: "reduce" })`
     * — and the contract above deserves its own test, which this suite does not yet have.
     */
    contextOptions: { reducedMotion: "no-preference" },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /**
   * Builds and serves the production app the same way `next start` runs it in
   * production — `next dev`'s on-demand compilation would put the pending-hold delay's
   * fast case up against JIT compile time rather than against the network, which is not
   * the property being asserted. `reuseExistingServer` is off in CI so a stale server
   * from a previous run can never be what the suite measures.
   */
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
