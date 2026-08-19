/**
 * The two ways an irreversible write can fail, which are **not the same fact** and must
 * never print the same sentence.
 *
 * Two forms hold one of these — `settings/delete-account/delete-account-form.tsx` (issue
 * #125) and `library/[entryId]/remove/remove-title-form.tsx` (issue #142) — and they are the
 * only two writes in the product that cannot be taken back. The distinction was written out
 * once for the first of them; this file is where it stops being written out twice, on
 * `errors/failure-treatment.ts`'s reasoning about its own class strings.
 *
 * **`refused`** is the server's own answer: it ran, the write did not happen, and the rows
 * are provably intact. Both writes are a single `DELETE` that Postgres commits or rolls back
 * whole, so there is no partial state for the copy to have to hedge about — which is what
 * lets each form say *nothing was destroyed* rather than *some of it may have been*.
 *
 * **`unknown`** is the call never coming back: a dropped connection, a server that went away
 * mid-request. The rows may be gone and they may not, and the one thing that must not be
 * printed on this branch is `refused`'s sentence, because where the write did land *it is
 * all still here* is a lie told about something irreversible. So each form says what is
 * true — that MediaSafe does not know — and then reaches for whatever can settle it. That
 * part is deliberately **not** shared: the account page asks the server, because being
 * signed out is the answer and the reader cannot see it for themselves; the remove page
 * sends the reader to their library, because the title being there or not is the answer and
 * looking is the only thing that gives it.
 *
 * `reference` is the Sentry event id from `errors/reference.ts`, and it stays nullable here
 * for the reason that file gives: Sentry may not be configured, and a reference invented
 * locally to fill the gap would be an id nobody can correlate with anything.
 */
export interface IrreversibleWriteFailure {
  readonly kind: "refused" | "unknown";
  readonly reference: string | null;
}
