"use client";

import { useRef, useState } from "react";

import { displayName } from "@/app/display-name";
import { IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { authClient } from "@/lib/auth-client";

/**
 * The display name — the whole of Settings' Profile section for now, issue #123.
 * `SPEC.md` §7: *editable, capped at ~24 characters, defaulted from Google.* The
 * timezone control named in the same table row is a separate ticket (#123 blocks it) and
 * does not belong here.
 *
 * ── Zero new columns, Better Auth's own update path ───────────────────────────────────
 *
 * `user.name` already exists. `authClient.updateUser({ name })` is the one write this
 * component makes — the same client `sign-out-button.tsx` uses, posting to
 * `/api/auth/update-user`, which sets a fresh session cookie carrying the new name. There
 * is no server action and no direct table write; `AGENTS.md`'s rule that `auth-schema.ts`
 * is generated and never hand-edited is a rule about the schema, and this never touches it.
 *
 * ── The cap refuses, it does not truncate ─────────────────────────────────────────────
 *
 * The native `maxLength` attribute is what the acceptance criterion actually asks for:
 * the twenty-fifth keystroke never lands, so there is nothing to truncate on save. The
 * counter beneath the field is what makes the limit "apparent before saving, not
 * discovered after" — it is not decoration.
 *
 * ── Empty is not a state ──────────────────────────────────────────────────────────────
 *
 * *Save* is disabled whenever the trimmed value is empty, so a cleared field cannot be
 * submitted — there is no request that could produce a nameless account. Trimming also
 * means an edit that is only whitespace does not count as a change at all.
 *
 * ── The write, the toast, and the rollback ────────────────────────────────────────────
 *
 * A `latest` ref carries the newest attempted name, so a standing toast's *Try again*
 * never resubmits a name the reader has since changed, and `raised.current?.standing()` is
 * what keeps a second failure from raising a second toast while the first is still on
 * screen (`AGENTS.md` — one toast per lost write).
 *
 * That pairing came from `library/rating-control.tsx`, which is retired; this file is where
 * it is written down now, rather than cited from somewhere that no longer exists. Both
 * halves matter and they are separate: `latest` is about *what* a retry sends, `standing()`
 * about *whether* a second failure speaks. `title: "Display name"` and no `episode`, matching the acceptance criterion
 * exactly. A failure reverts the field to `committed` — the last name the server actually
 * confirmed — not to the `name` prop, which goes stale the moment one save succeeds.
 *
 * ── The shell hears the name, not the whole page — issue #179 ────────────────────────
 *
 * This used to call `router.refresh()` on success, and the reason given was true: the
 * masthead and the sidebar read `user.name` server-side, they sit in
 * `(signed-in)/layout.tsx`, and the client Router Cache keeps layouts across navigations,
 * so nothing else would ever tell them. What was wrong was the price. A refresh re-renders
 * the entire route tree and re-runs every read on the page — the session read included —
 * and every one of those answers is already on screen. The only thing that changed is one
 * string, and this component is holding it.
 *
 * So it publishes: `displayName.set(nextName)`, which the two cells in the shell subscribe
 * to and nothing else re-renders. Issue #176's rule, applied to a write whose "updated
 * row" is a single field — *return the updated data directly where the caller can apply
 * it* rather than invalidate anything.
 *
 * **After the server confirmed it, never before.** The field itself is optimistic and
 * rolls back; the masthead is not, and must not be. A name that appears up there and then
 * quietly reverts is a lost write reported by a flicker, which is the opposite of the
 * non-dismissing toast below.
 */
const DISPLAY_NAME_MAX_LENGTH = 24;

export function DisplayNameControl({ name }: { readonly name: string }) {
  const [committed, setCommitted] = useState(name);
  const [value, setValue] = useState(name);
  const [inFlight, setInFlight] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);
  const latest = useRef<string | null>(null);

  const trimmed = value.trim();
  const disabled = inFlight || trimmed.length === 0 || trimmed === committed;

  function save(): void {
    if (disabled) return;
    latest.current = trimmed;
    void attempt(trimmed);
  }

  // A declaration, not a `useCallback`: handed to the toast as `retry`, and a `const`
  // cannot be referenced inside its own initialiser.
  async function attempt(nextName: string): Promise<void> {
    setInFlight(true);

    const outcome = await write(nextName);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setCommitted(nextName);
      setValue(nextName);
      setInFlight(false);
      displayName.set(nextName);
      return;
    }

    setInFlight(false);
    setValue(committed);

    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      title: "Display name",
      reference: outcome.reference,
      retry: () => void attempt(latest.current ?? committed),
    });
  }

  return (
    <div>
      <label htmlFor="display-name" className="code-line text-dim">
        Display name
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="border border-hair px-3 py-2 focus-within:border-2 focus-within:border-text">
          <input
            id="display-name"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={inFlight}
            autoComplete="off"
            className="w-48 bg-transparent text-item text-text focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className={`${SOLID_RECOVERY} ${IN_FLIGHT}`}
        >
          {inFlight ? "Saving" : "Save"}
        </button>
      </div>

      <p className="mt-2 code-line text-dim" data-numeric>
        {trimmed.length} / {DISPLAY_NAME_MAX_LENGTH}
      </p>
    </div>
  );
}

async function write(
  nextName: string,
): Promise<{ ok: true } | { ok: false; reference: string | null }> {
  const { error } = await authClient.updateUser({ name: nextName });

  if (error) {
    return {
      ok: false,
      reference: referenceFor(new Error("Display name did not save."), {
        surface: "settings",
      }),
    };
  }

  return { ok: true };
}
