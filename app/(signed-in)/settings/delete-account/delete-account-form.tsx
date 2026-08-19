"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import type { IrreversibleWriteFailure } from "@/errors/irreversible-failure";
import { IN_FLIGHT, NOT_YET_ARMED, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { ReferenceLine } from "@/errors/reference-line";
import { deleteAccountAction, type DeleteAccountOutcome } from "./actions";
import { confirmationMatches, CONFIRMATION_WORD } from "./confirmation";

/**
 * The confirmation, and the only control on the page that does anything — issue #125.
 *
 * It sits **below** the numbers, and that placement is the argument for a fixed
 * confirmation word rather than an incidental layout choice: see `confirmation.ts`. The
 * page is what puts it there; this component only refuses to work until the word matches.
 *
 * ── Visiting does nothing, leaving does nothing ──────────────────────────────────────
 *
 * There is no effect in this file and no write on mount. The page renders, the field is
 * empty, the button is dead, and navigating away runs nothing. The only path to the action
 * is a submit from an armed form.
 *
 * ── The disabled button has two reasons and they are not the same reason ─────────────
 *
 * `IN_FLIGHT` while the delete is running; `NOT_YET_ARMED` — added to
 * `errors/recovery-buttons.ts` by this ticket — for the state this button spends most of
 * its life in, refusing because the word has not been typed. Both carry the one
 * `DISABLED_DIM`, so the dim stays a decision taken in one place; only the cursor differs,
 * because *busy* and *refusing* are not the same fact.
 *
 * ── Solid `signal` here is a stated extension, not a quotation ───────────────────────
 *
 * `DESIGN.md`'s Buttons section scopes solid `signal` on `ink` to two things: the phone's
 * recording control, and *the one primary recovery action*. This is neither, so using
 * `SOLID_RECOVERY` here widens the list and that is said out loud rather than left to be
 * discovered — the same courtesy `recovery-buttons.ts` extends for the disabled variant.
 *
 * The argument for widening it: `DESIGN.md`'s Motion section calls marking a watch *the one
 * authored moment of the whole product*, and gives it this exact ground. Deleting an account
 * is the other irreversible authored moment, and it is the only one that cannot be undone.
 * A quieter treatment would make the most consequential control in the application read as
 * less live than a rewatch. The button is also dead until the word is typed, so the full
 * vermilion arriving *is* a live state — which is the job `DESIGN.md` gives the ink.
 */
/**
 * The distinction moved to `errors/irreversible-failure.ts` when issue #142's remove became
 * the second form to need it; that file carries the argument, including why *what settles an
 * `unknown`* is each form's own and not shared. Here it is the server that is asked, because
 * being signed out is the answer and the reader cannot see it for themselves.
 */
type Failure = IrreversibleWriteFailure;

export function DeleteAccountForm() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const armed = confirmationMatches(typed);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The `disabled` attribute already covers both, and a form can still be submitted by
    // Enter in the field — so the guard is here rather than only on the button.
    if (!armed || inFlight) return;

    setFailure(null);
    setInFlight(true);

    let outcome: DeleteAccountOutcome;
    try {
      outcome = await deleteAccountAction(typed);
    } catch (error) {
      /**
       * The call itself did not come back. Reported and shown — never softened into a
       * refusal, and never into a success.
       *
       * `router.refresh()` is what resolves the ambiguity without the reader having to do
       * anything: the server re-renders this page, and it is the only party that knows the
       * answer. If the account went, `requireUserId()` sends them to sign-in and the
       * question is settled. If it did not, the counts come back and the message below is
       * standing over them, which is exactly the state they are in.
       */
      setInFlight(false);
      setFailure({
        kind: "unknown",
        reference: referenceFor(error, { surface: "delete-account" }),
      });
      router.refresh();
      return;
    }

    if (!outcome.ok) {
      setInFlight(false);
      setFailure({ kind: "refused", reference: outcome.reference });
      return;
    }

    /**
     * `inFlight` is deliberately left `true`. The navigation below is asynchronous and the
     * account is already gone; re-enabling the button for those milliseconds would offer a
     * second press that could only ever fail.
     *
     * Order matters, exactly as in `sign-out-button.tsx`: `refresh()` empties the
     * client-side Router Cache, so the navigation cannot be served the signed-in shell
     * that is still sitting in it. `replace`, not `push`, so this page is not one
     * back-press away.
     */
    router.refresh();
    router.replace("/sign-in");
  }

  return (
    <form onSubmit={submit}>
      {failure === null ? null : (
        // `alert`, not `status`: this appears only in response to a press, and what it has
        // to say is that something the reader believes happened did not.
        <section role="alert" className={`mb-8 ${FAILURE_SECTION}`}>
          <h2 className={FAILURE_HEADING}>
            {failure.kind === "refused"
              ? "Your account was not deleted"
              : "MediaSafe does not know whether your account was deleted"}
          </h2>

          <p className={FAILURE_PROSE}>
            {failure.kind === "refused"
              ? "MediaSafe reached the server and the deletion did not happen, so nothing was destroyed. Your library, your watches and your ratings are all still here, and you are still signed in. Try again — and if it keeps happening, the reference below identifies this exact failure."
              : "The connection dropped before the server answered, so MediaSafe cannot tell you whether the deletion happened. It is checking now: if you are still signed in a moment from now, and the numbers above are still there, nothing was destroyed and you can try again."}
          </p>

          {failure.reference === null ? null : (
            <div className="mt-6">
              <ReferenceLine reference={failure.reference} />
            </div>
          )}
        </section>
      )}

      <label
        htmlFor="delete-confirmation"
        className="block max-w-[60ch] text-note leading-relaxed text-stock-dim"
      >
        {/* Not `code-line`, which uppercases: the word has to be readable in the case it
            has to be typed in, and a label reading DELETE above a field that refuses
            `DELETE` would be the page arguing with itself. */}
        To confirm, type <span className="text-stock">{CONFIRMATION_WORD}</span> below.
      </label>

      <input
        id="delete-confirmation"
        // `text`, not `search`, and not `password`. The same reason the filter field
        // gives: WebKit draws its own controls inside other types, and this world has
        // none of them.
        type="text"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        // The four that make "exactly" a rule about deliberation rather than about
        // phones — a keyboard that autocapitalises would put `Delete` in the field and
        // leave the button dead with nothing on screen explaining why.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        // `DESIGN.md`, Inputs: a `1px` `rule-bold` border on a transparent ground at
        // `text-item`, the border moving to `signal` on focus with the input's own
        // outline suppressed in favour of it.
        className="mt-4 block w-full max-w-[16rem] border border-rule-bold bg-transparent px-3 py-2 text-item text-stock focus:border-signal focus:outline-none"
      />

      <div className="mt-8">
        <button
          type="submit"
          disabled={!armed || inFlight}
          className={`${SOLID_RECOVERY} ${inFlight ? IN_FLIGHT : NOT_YET_ARMED}`}
        >
          {inFlight ? "Deleting your account" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
