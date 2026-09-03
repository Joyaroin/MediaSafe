import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { seedFixtureSession } from "./support/fixture-session";
import { toStorageState } from "./support/storage-state";

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
  writeFileSync(storageStatePath, JSON.stringify(toStorageState(session), null, 2));
}
