import { PendingLine } from "@/app/pending-line";
import { BackBar } from "../back-bar";
import { SettingsHeading, YOU } from "./settings-heading";

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
    <main className="arrive-fast flex w-full flex-1 flex-col">
      <BackBar origin={YOU} round />
      <SettingsHeading />

      <div className="mt-6 w-full max-w-2xl px-gutter lg:px-10">
        <PendingLine shape="form" held />
      </div>
    </main>
  );
}
