"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import { GHOST_RECOVERY, IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { ReferenceLine } from "@/errors/reference-line";
import { answerImportOfferAction } from "./actions";

/**
 * The two answers to the first-run offer, and the one write behind both of them
 * (`SPEC.md` §7, issue #75).
 *
 * `DESIGN.md`, Buttons: *the one primary recovery action (`Bring your library in`) is
 * solid `signal` with `ink` text* — named there before this screen existed to hold it, and
 * the decline sits beside it at the ghost treatment the same section gives every lesser
 * action.
 *
 * ── Why this is a client component and not two forms ─────────────────────────────────
 *
 * `answerImportOfferAction` marks the offer answered; it does not decide where the reader
 * goes next. That decision — `/import` or `/library` — is made here, after the write
 * lands, mirroring `sign-out-button.tsx`: `router.refresh()` empties the Router Cache so
 * a back-press cannot replay this screen's still-unanswered render, and `router.replace()`
 * rather than `push()` keeps `/welcome` off the history stack once it has been answered.
 *
 * ── A failure here is not a toast ─────────────────────────────────────────────────────
 *
 * The same reasoning `import-surface.tsx` carries for the halted import: this screen has
 * one control and no surface around it that carries on if the write is lost, so the
 * inline failure treatment is the one that fits, not a toast meant for a lost write on a
 * surface that survives it.
 */
export function WelcomeSurface() {
  const router = useRouter();
  const [inFlight, setInFlight] = useState<"import" | "decline" | null>(null);
  const [failed, setFailed] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  async function choose(destination: "/import" | "/library", pressed: "import" | "decline") {
    setFailed(false);
    setReference(null);
    setInFlight(pressed);

    const outcome = await answerImportOfferAction();

    if (!outcome.ok) {
      setInFlight(null);
      setFailed(true);
      setReference(outcome.reference);
      return;
    }

    router.refresh();
    router.replace(destination);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => choose("/import", "import")}
          disabled={inFlight !== null}
          className={`${SOLID_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight === "import" ? "Bringing your library in" : "Bring your library in"}
        </button>

        <button
          type="button"
          onClick={() => choose("/library", "decline")}
          disabled={inFlight !== null}
          className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight === "decline" ? "Setting up your library" : "Start with an empty library"}
        </button>
      </div>

      {failed ? (
        <section role="alert" className={`mt-6 ${FAILURE_SECTION}`}>
          <h2 className={FAILURE_HEADING}>That did not go through</h2>
          <p className={FAILURE_PROSE}>
            MediaSafe could not record your answer. Nothing has changed — try again.
          </p>
          {reference === null ? null : (
            <div className="mt-6">
              <ReferenceLine reference={reference} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
