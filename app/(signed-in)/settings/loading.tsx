import { PendingLine } from "@/app/pending-line";
import { SettingsHeading } from "./settings-heading";

/**
 * Settings, which is still reading.
 *
 * Radius 1. There is no `error.tsx` on this route to take the formula from
 * — `requireDisplayName()` and `requireTimezone()` are the reads and a failure lands on the
 * root boundary — so this renders the one thing `page.tsx` has that is not a read: its own
 * literal heading, with one dim line where the three sections will be.
 */
export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <SettingsHeading />

      <div className="mt-12">
        <PendingLine shape="form" held />
      </div>
    </main>
  );
}
