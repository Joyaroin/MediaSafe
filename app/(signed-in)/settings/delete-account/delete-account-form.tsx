"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import { SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { ReferenceLine } from "@/errors/reference-line";
import { deleteAccountAction } from "./actions";
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
 * `errors/recovery-buttons.ts`'s `IN_FLIGHT` is deliberately not used here. Its own
 * docblock pins its meaning — *the control is not refusing, it is busy* — and for almost
 * all of this button's life the opposite is true: it is refusing, because the word has not
 * been typed. `cursor-wait` on a control that is waiting for the reader would be a small
 * lie in the one place the page cannot afford one, so the cursor is chosen from the actual
 * reason and the dimming, which is the same either way, is shared.
 */
export function DeleteAccountForm() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const armed = confirmationMatches(typed);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The `disabled` attribute already covers both, and a form can still be submitted by
    // Enter in the field — so the guard is here rather than only on the button.
    if (!armed || inFlight) return;

    setFailed(false);
    setReference(null);
    setInFlight(true);

    const outcome = await deleteAccountAction(typed);

    if (!outcome.ok) {
      setInFlight(false);
      setFailed(true);
      setReference(outcome.reference);
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
      {failed ? (
        // `alert`, not `status`: this appears only in response to a press, and what it has
        // to say is that something the reader believes happened did not.
        <section role="alert" className={`mb-8 ${FAILURE_SECTION}`}>
          <h2 className={FAILURE_HEADING}>Your account was not deleted</h2>

          <p className={FAILURE_PROSE}>
            MediaSafe could not reach the server to delete your account, so nothing was
            destroyed. Your library, your watches and your ratings are all still here, and
            you are still signed in. Try again — and if it keeps happening, the reference
            below identifies this exact failure.
          </p>

          {reference === null ? null : (
            <div className="mt-6">
              <ReferenceLine reference={reference} />
            </div>
          )}
        </section>
      ) : null}

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
          className={`${SOLID_RECOVERY} disabled:brightness-75 ${
            inFlight ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"
          }`}
        >
          {inFlight ? "Deleting your account" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
