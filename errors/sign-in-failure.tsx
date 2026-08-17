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
      // `assertive`, unlike the offline banner's `polite`: this is the result of
      // something the reader just did, and they are waiting to hear about it.
      role="alert"
      className="border-t-2 border-signal py-6"
    >
      <h2 className="bill-title text-bill-md text-signal">That did not sign you in</h2>

      <p className="mt-4 max-w-[60ch] text-note leading-relaxed text-stock">
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
