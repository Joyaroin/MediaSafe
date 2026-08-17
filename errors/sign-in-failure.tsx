import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "./failure-treatment";
import { ReferenceLine } from "./reference-line";

/**
 * The third placement. `SPEC.md` §6: *errors are placed by blast radius: read inline,
 * write toast, **auth full-page**.*
 *
 * This is that third one, and it is the one surface `AGENTS.md`'s table does not list —
 * because when that table was written there was no auth. It is not a fourth treatment
 * invented under delivery pressure; it is the one the spec named and left for this
 * ticket.
 *
 * ── Why full-page, and why this specific regression ──────────────────────────────────
 *
 * `docs/design/v1-surfaces.md` §Screen notes is unusually literal about it: *it must have
 * a designated place to render a failure, full-page — `tvtracker`'s auth form rendered no
 * error at all (`apps/web/src/components/auth/auth-form.tsx:10-16`), so a failed sign-in
 * on a phone produced a flickering button and nothing else.* A signed-out reader has one
 * control and no other surface to be told anything on, so a failure that is not full-page
 * is a failure that is nowhere.
 *
 * *Designated place* is why this component is rendered by the sign-in surface at all
 * times as a region rather than swapped in for the control: the control stays on screen
 * underneath, because on this surface the recovery action and the only action are the
 * same button.
 *
 * ── What it is allowed to say ────────────────────────────────────────────────────────
 *
 * Plain sentences, and no parameter an exception could arrive in — the same rule the
 * write-failure toast is built to. Better Auth hands its OAuth failures back as a code in
 * the query string (`?error=access_denied`) and sometimes an `error_description` written
 * by Google. **Neither is rendered.** They are machine-readable strings about a protocol,
 * and `SPEC.md` §6 allows the reader exactly one technical string: the reference id, when
 * there is a real one.
 */
export function SignInFailure({
  reference,
}: {
  /** The Sentry event id, or `null` — which is the usual case here. See below. */
  reference: string | null;
}) {
  return (
    <section
      /**
       * `role="status"`, not `role="alert"`.
       *
       * An alert interrupts whatever a screen reader is saying, which is right for
       * something that happens *while* the reader is on the page — and this region has two
       * arrivals, only one of which is that. Returning from Google with `?error=` renders
       * it in the document's first paint, and a live region already present at load is not
       * announced by most screen readers anyway; it is read in document order, above the
       * control, which is where it needs to be. `status` is the honest one for a region
       * that is sometimes new and sometimes just there.
       */
      role="status"
      className={FAILURE_SECTION}
    >
      <h2 className={FAILURE_HEADING}>That did not sign you in</h2>

      <p className={FAILURE_PROSE}>
        MediaSafe did not hear back from Google, or heard back that the sign-in was
        refused. No account was created and nothing was lost. Try again below.
      </p>

      {reference === null ? null : (
        <div className="mt-6">
          <ReferenceLine reference={reference} />
        </div>
      )}
    </section>
  );
}
