import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { seedFixtureSession } from "./support/fixture-session";

/**
 * Runs once before the suite. Writes the seeded fixture account's session into a
 * Playwright `storageState` file, so every spec starts already signed in rather than
 * re-minting a session per test — issue #304's "a seeded fixture account and a minted
 * session" is one account for the run, not one per assertion.
 *
 * `playwright.config.ts` points `use.storageState` at the file this writes.
 */
export default async function globalSetup(): Promise<void> {
  const session = await seedFixtureSession();

  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });

  const storageStatePath = path.join(authDir, "fixture-session.json");
  writeFileSync(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [
          {
            name: session.cookie.name,
            value: session.cookie.value,
            domain: "localhost",
            path: session.cookie.path,
            expires: session.cookie.expires,
            httpOnly: session.cookie.httpOnly,
            secure: session.cookie.secure,
            sameSite: session.cookie.sameSite,
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}
