import { PendingLine } from "@/app/pending-line";
import { GroupHeading } from "../group-screen";

/** WATCHLIST's own screen, still reading — issue #181. See `ongoing/loading.tsx`. */
export default function WatchlistGroupLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <GroupHeading label="Watchlist" />

      <div className="px-4 py-5">
        <PendingLine />
      </div>
    </main>
  );
}
