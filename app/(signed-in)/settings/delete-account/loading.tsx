import { PendingLine } from "@/app/pending-line";
import { BackToSettings, DeleteAccountHeading } from "./delete-account-frame";

/**
 * The counts are still being read, so there is nothing here to confirm yet — the same
 * argument `titles/[entryId]/remove/loading.tsx` makes for the identical shape: a page
 * that has **not yet** counted an account's rows is the same page that must not offer to
 * destroy them, and the way to guarantee that is for the pending render to have no form in
 * it at all rather than for a form to be conditionally hidden.
 *
 * `DESIGN.md` §9: what the segment's `error.tsx` renders, less the failure — the heading
 * and the way back, from `delete-account-frame.tsx`'s two pieces, with one dim line in the
 * gutter the failure would have used.
 */
export default function DeleteAccountLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <DeleteAccountHeading />

      <div className="mt-8">
        <PendingLine shape="form" held />
      </div>

      <BackToSettings />
    </main>
  );
}
