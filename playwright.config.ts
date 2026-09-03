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
