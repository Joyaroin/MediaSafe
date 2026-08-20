"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import type { IrreversibleWriteFailure } from "@/errors/irreversible-failure";
import { GHOST_RECOVERY, IN_FLIGHT } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { ReferenceLine } from "@/errors/reference-line";
import { removeTitleAction, type RemoveTitleOutcome } from "./actions";

/**
 * The confirmation, and the only control on the page that does anything — issue #142.
 *
 * It sits **below** the numbers, for the reason `settings/delete-account/confirmation.ts`
 * gives about its own field: what is being confirmed has to have been read before it can be
 * confirmed. The page is what puts it there; this component only presses the button.
 *
 * ── Visiting does nothing, leaving does nothing ──────────────────────────────────────
 *
 * There is no effect in this file and no write on mount. The page renders, the button
 * waits, and navigating away runs nothing. The only path to the action is a press.
 *
 * ── Ghost, where the delete-account button is solid ──────────────────────────────────
 *
 * `DESIGN.md`'s Buttons section scopes the solid accent — `bg-accent` on `text-accent-ink`
 * since issue #134 renamed the ink, `signal` on `ink` before it — to the phone's recording
 * control and *the one primary recovery action*; issue #125 widened it for deleting an
 * account and said so out loud. **This does not widen it again**, and the difference is not
 * timidity. That button spends its life dead and arms only once the word is typed, so the
 * accent arriving *is* a live state, which is the job the ink is given. Nothing arms this
 * one, so a solid accent field would sit on the page from the moment it loads — the accent
 * used as a ground rather than as an event, and a colour that means *a watch was recorded*
 * spent on a page where nothing has been. The ghost treatment keeps it an outline until the
 * hover inverts it, and the inversion is an affordance `DESIGN.md` already sanctions.
 *
 * `GHOST_RECOVERY` is named for where it was first needed, and its own docblock says it is
 * *only errors-only today*. This is the second kind of surface to want it.
 */

/**
 * `errors/irreversible-failure.ts` carries the distinction and why the two kinds must never
 * print the same sentence. What is this form's own is what settles an `unknown`: the reader
 * is sent to their library, because the title being there or not is the answer and looking
 * is the only thing that gives it.
 *
 * **The button is not re-offered on that branch.** Pressing it again would either remove a
 * title the reader has not been told is still there, or fail as `refused` and print *nothing
 * was destroyed* over a removal that had already happened.
 */
type Failure = IrreversibleWriteFailure;

export function RemoveTitleForm({
  libraryEntryId,
  titleName,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
}) {
  const router = useRouter();
  const [inFlight, setInFlight] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The `disabled` attribute already covers this, and a form can still be submitted by
    // Enter — so the guard is here rather than only on the button.
    if (inFlight || failure?.kind === "unknown") return;

    setFailure(null);
    setInFlight(true);

    let outcome: RemoveTitleOutcome;
    try {
      outcome = await removeTitleAction(libraryEntryId);
    } catch (error) {
      // The call itself did not come back. Reported and shown — never softened into a
      // refusal, and never into a success.
      setInFlight(false);
      setFailure({
        kind: "unknown",
        reference: referenceFor(error, { surface: "remove-from-library" }),
      });
      return;
    }

    if (!outcome.ok) {
      setInFlight(false);
      setFailure({ kind: "refused", reference: outcome.reference });
      return;
    }

    /**
     * `inFlight` is deliberately left `true`. The navigation below is asynchronous and the
     * title is already gone; re-enabling the button for those milliseconds would offer a
     * second press that could only ever fail.
     *
     * There is no `refresh()` here any more (issue #179). Keeping the library from being
     * served a grid with this title still in it is `revalidatePath("/library")` inside
     * `removeTitleAction`, which names that route rather than refreshing this one on its
     * way out, and rides back on the response of the write instead of costing a second
     * round trip.
     *
     * `replace`, not `push`, so this page is not one back-press away — the title's own
     * detail route still is, and a back press onto it finds no entry and renders that
     * route's read failure, which is a rare landing and an honest one.
     */
    router.replace("/library");
  }

  return (
    <form onSubmit={submit}>
      {failure === null ? null : (
        // `alert`, not `status`: this appears only in response to a press, and what it has
        // to say is that something the reader believes happened did not.
        <section role="alert" className={`mb-8 ${FAILURE_SECTION}`}>
          <h2 className={FAILURE_HEADING}>
            {failure.kind === "refused"
              ? `${titleName} was not removed`
              : `MediaSafe does not know whether ${titleName} was removed`}
          </h2>

          <p className={FAILURE_PROSE}>
            {failure.kind === "refused"
              ? "MediaSafe reached the server and the removal did not happen, so nothing was destroyed. The title is still in your library and so is every watch of it. Try again — and if it keeps happening, the reference below identifies this exact failure."
              : "The connection dropped before the server answered, so MediaSafe cannot tell you whether the removal happened. Open your library and look: if the title is still there, nothing was destroyed and you can start again from it."}
          </p>

          {failure.kind === "unknown" ? (
            <div className="mt-6">
              <Link href="/library" className={GHOST_RECOVERY}>
                Open your library ›
              </Link>
            </div>
          ) : null}

          {failure.reference === null ? null : (
            <div className="mt-6">
              <ReferenceLine reference={failure.reference} />
            </div>
          )}
        </section>
      )}

      {failure?.kind === "unknown" ? null : (
        <button
          type="submit"
          disabled={inFlight}
          className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight ? `Removing ${titleName}` : `Remove ${titleName}`}
        </button>
      )}
    </form>
  );
}
