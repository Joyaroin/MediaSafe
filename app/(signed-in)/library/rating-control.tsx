"use client";

import { useRef, useState } from "react";

import { IN_FLIGHT } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { rateTitleAction, type RatingOutcome } from "./rating-action";

/**
 * Your rating of one title — issue #113, and the last thing in ADR-0001's model that had
 * no control.
 *
 * ── Ten cells, not five ───────────────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Rating Scale section said *five* until this ticket, and that was a defect
 * rather than a decision: ADR-0001 settled `CHECK (rating BETWEEN 1 AND 10)` and named
 * *"a rating is a whole number 1–10"* as a binding consequence for the design tickets,
 * which then built five without ever choosing a five-point scale. `SPEC.md` §10.3 records
 * the divergence and rules for the schema. The treatment is unchanged and quoted straight
 * off `docs/design/prototypes/repertory-bill.html:452-458` — square cells, `1px` gaps over
 * `hair`, tabular numerals, label typography, unselected `ground` with dim bone, the chosen
 * value inverted to solid `accent` with `accent-ink` text, hover previewing the same inversion.
 *
 * ── The one build-time deviation: the cells share the row rather than sizing to a digit ─
 *
 * §10.3 flagged the fit in advance. Ten cells at the prototype's `0.875rem` horizontal
 * padding come to roughly 365px, which fits the desktop panel's 372px of content and does
 * not fit the phone's — a 375px viewport leaves 327px inside the same `1.5rem` gutters —
 * and `10` is two digits, so under fixed padding the last cell would also be visibly wider
 * than the other nine. §10.3 called tightening the padding a build-time call, so this
 * takes it in the form that solves both at once: `flex-1` gives every cell an equal share
 * of whatever width there is, so ten identical cells fit whatever they are put in and `10`
 * is no wider than `1`. Nothing about the treatment changes — only where the width comes
 * from.
 *
 * ── Optimistic, the same shape as `AbandonControl` ───────────────────────────────────
 *
 * `optimistic` inverts the pressed cell before the server has answered, and a failure puts
 * it back — `SPEC.md` §3.3's *a lost write is never silent*, and the acceptance criterion's
 * *rolls the control back to its previous value*. `null` defers to the caller's `rating`
 * prop, so the rollback is nothing more than clearing it: whatever the caller last knew is
 * what returns. That doubles as the in-flight indicator, so there is no separate `pending`
 * flag to keep in step with it.
 *
 * `onRated` is why a landed write does not roll back the same way. The caller patches its
 * own copy of `detail.rating` in the same batch as `optimistic` clears — so the cell that
 * stays inverted is inverted because the database says so, not because this component is
 * still holding a guess. The entry id travels with it for the reason `AbandonControl`'s
 * docblock gives: the desktop pane never navigates, so a write still in flight when the
 * reader selects a different title must not patch the one now on screen.
 *
 * ── What this deliberately does not do ────────────────────────────────────────────────
 *
 * There is no clear, and pressing the chosen value again does nothing. `SPEC.md` §7 gives
 * rating one verb — *overwritten on change* — and no ticket has ever asked for a way back
 * to unrated; inventing one here would be inventing a write, and re-sending the value
 * already stored would be spending a round trip to change nothing. There is also no
 * prompt, no nag and no empty state: an unrated title renders ten unselected cells and
 * says nothing about it, because *nothing reads a rating in v1* and a control that asks to
 * be used is the rating-grind session §7 records as declined.
 */
export function RatingControl({
  libraryEntryId,
  titleName,
  rating,
  onRated,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly rating: number | null;
  readonly onRated: (libraryEntryId: string, rating: number) => void;
}) {
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const shown = optimistic ?? rating;
  const raised = useRef<WriteFailureHandle | null>(null);
  /**
   * The most recent press, and the only thing a standing toast's *Try again* ever writes.
   *
   * AGENTS.md's rule is **one toast per lost write, not one per attempt**, and a rating
   * has one lost write however many times it is pressed: there is one column, and the
   * newest choice is the only one the reader still wants in it. Without this the toast
   * raised by a failed 7 would keep retrying 7 after the reader had since pressed 9 and
   * watched that fail too — the number on offer would be the one the reader had already
   * moved off. The whole press is kept, not just its value, so a retry can never pair one
   * press's number with another's title.
   */
  const latest = useRef<Press | null>(null);

  function choose(value: number): void {
    // Read from this render's props at the moment of the press, the same way
    // `AbandonControl` does and for the same reason: the desktop pane never navigates, so
    // a write still in flight when the reader selects a different title must resolve
    // against the entry it was actually asked to change.
    latest.current = { libraryEntryId, titleName, value };
    void attempt(latest.current);
  }

  // A declaration, not a `useCallback`: it is handed to the toast as `retry`, and a
  // `const` cannot be referenced inside its own initialiser.
  async function attempt(press: Press): Promise<void> {
    setOptimistic(press.value);

    const outcome = await write(press.libraryEntryId, press.value);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      onRated(press.libraryEntryId, press.value);
      setOptimistic(null);
      return;
    }

    setOptimistic(null);

    // One toast per lost write, not one per attempt (AGENTS.md) — but only while the
    // reader can still see it. `standing()` is what separates the two: a handle the reader
    // has dismissed names a toast that is gone, and returning early on it would make the
    // *next* lost write silent, which is the one thing `SPEC.md` §3.3 does not allow.
    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      // No `episode`, and that is the point of it being optional: this is a write about
      // the title itself, and there is no episode it could name that would be true.
      title: press.titleName,
      reference: outcome.reference,
      // `latest.current`, not `press` — the standing toast retries the newest choice.
      retry: () => void attempt(latest.current ?? press),
    });
  }

  return (
    <div className="mt-7">
      <p className="code-line text-dim">Your rating</p>

      {/* The `1px` gaps are the group's own ground showing through, not ten borders —
          `DESIGN.md`'s *`1px` gaps over `hair`*. `items-stretch` is what keeps every cell
          the same height once one of them is taller than its neighbours. */}
      <div
        className="mt-3 flex items-stretch gap-px bg-hair"
        role="group"
        aria-label={`Rate ${titleName}`}
      >
        {SCALE.map((value) => (
          <Cell
            key={value}
            value={value}
            chosen={value === shown}
            busy={optimistic !== null}
            onChoose={() => {
              if (value === shown) return;
              choose(value);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** ADR-0001: *a rating is a whole number 1–10*. The scale is the constraint, spelled out. */
const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** One press, kept whole so a retry can never pair one press's value with another's title. */
interface Press {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly value: number;
}

function Cell({
  value,
  chosen,
  busy,
  onChoose,
}: {
  readonly value: number;
  readonly chosen: boolean;
  readonly busy: boolean;
  readonly onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={busy}
      // No `aria-label`: the cell's own text already names it, and the group above says
      // what is being rated. Ten cells each repeating the title is how a scale becomes
      // unusable to listen to, and `aria-pressed` is the whole of the rest.
      aria-pressed={chosen}
      data-numeric
      className={`code-line flex-1 px-1 py-2 text-center transition-colors duration-150 ${IN_FLIGHT} ${
        chosen
          ? "bg-accent text-accent-ink"
          : "bg-ground text-dim hover:bg-accent hover:text-accent-ink"
      }`}
    >
      {value}
    </button>
  );
}

async function write(libraryEntryId: string, rating: number): Promise<RatingOutcome> {
  try {
    return await rateTitleAction(libraryEntryId, rating);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "rating" }) };
  }
}
