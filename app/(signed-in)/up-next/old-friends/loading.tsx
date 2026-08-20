import { PendingLine } from "@/app/pending-line";
import { GroupHeading } from "../group-screen";

/** OLD FRIENDS' own screen, still reading — issue #181. See `ongoing/loading.tsx`. */
export default function OldFriendsGroupLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <GroupHeading label="Old friends" />

      <div className="px-4 py-5">
        <PendingLine />
      </div>
    </main>
  );
}
