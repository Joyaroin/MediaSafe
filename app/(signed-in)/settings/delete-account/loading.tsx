import { PendingLine } from "@/app/pending-line";
import {
  BackToSettings,
  DELETE_ACCOUNT_CARD,
  DeleteAccountHeading,
} from "./delete-account-frame";

/**
 * The counts are still being read, so there is nothing here to confirm yet — the same
 * argument `titles/[entryId]/remove/loading.tsx` makes for the identical shape: a page
 * that has **not yet** counted an account's rows is the same page that must not offer to
 * destroy them, and the way to guarantee that is for the pending render to have no form in
 * it at all rather than for a form to be conditionally hidden.
 *
 * What the segment's `error.tsx` renders, less the failure — the heading
 * and the way back, from `delete-account-frame.tsx`'s two pieces, with one dim line in the
 * gutter the failure would have used.
 */
export default function DeleteAccountLoading() {
  return (
    <main className="arrive-fast mx-auto w-full max-w-2xl px-gutter py-8 lg:py-12">
      <div className={DELETE_ACCOUNT_CARD}>
        <DeleteAccountHeading />

        <div className="mt-5">
          <PendingLine shape="form" held />
        </div>

        <BackToSettings />
      </div>
    </main>
  );
}
