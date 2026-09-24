"use client";

import { useRef, useState } from "react";

import { LIST_NAME_MAX_LENGTH, type ListSummary } from "@/db/access";
import { GHOST_RECOVERY, IN_FLIGHT } from "@/errors/recovery-buttons";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";

/**
 * The name field, the duplicate-name message, and the optimistic write, shared by the two
 * places a list gets named: the Lists page's own `create-list-form.tsx` (issue #146) and
 * title detail's *Add to list* dialog (`add-to-list-control.tsx`, issue #147). Both are
 * the same interaction — type a name, press *New list*, land on a `ListSummary` or a
 * duplicate-name message — differing only in **which write lands** and **what a lost
 * write's toast should name**, which is why `submit` and `toastTitle` are the two things
 * a caller supplies rather than this component knowing either.
 *
 * ── `toastTitle`, not a fixed field ────────────────────────────────────────────────────
 *
 * `create-list-form.tsx` names its toast after the list being made — there is no other
 * title on that screen. The *Add to list* dialog names its toast after the film or show
 * being added, because `AGENTS.md`'s toast is `title: titleName`-shaped and a reader who
 * just typed a list name is still thinking about the title they came here to file, not
 * the list. Passing a callback rather than a string is what lets the second caller ignore
 * the name it was just handed and answer with something else entirely.
 *
 * ── No `try`/`catch` here ──────────────────────────────────────────────────────────────
 *
 * `submit` is handed the outcome type directly; whether it wraps its own Server Action
 * call in a `try`/`catch` — the way `add-to-list-control.tsx`'s `createAndAdd` does, for
 * the request never reaching the server at all — is each caller's own call, the same
 * shape `catalogue-result.tsx`'s `add()` already uses.
 * This component only runs what it is given.
 */
export type ListNameOutcome =
  | { readonly ok: true; readonly list: ListSummary }
  | { readonly ok: false; readonly reason: "duplicate" }
  | { readonly ok: false; readonly reason: "failed"; readonly reference: string | null };

export function ListNameForm({
  fieldId,
  fieldClassName = "",
  inputClassName,
  formClassName = "",
  pendingLabel,
  submitClassName = GHOST_RECOVERY,
  toastTitle,
  submit,
  onCreated,
}: {
  /** `id`/`htmlFor` pair for the field — the two callers sit on the same page as each
   *  other's rows in neither case, but a shared id would still collide were that to
   *  change. */
  readonly fieldId: string;
  /** Classes on the field's own wrapper — `create-list-form.tsx` leaves this bare so the
   *  field sizes to its input; the dialog passes `flex-1` to fill the modal's width. */
  readonly fieldClassName?: string;
  /** Classes on the input itself — the two callers fix the width from opposite ends
   *  (`w-48` fixed versus `w-full` filling `fieldClassName`'s `flex-1`). */
  readonly inputClassName: string;
  /** Extra classes on the `<form>` — only the dialog needs a top margin under its own
   *  heading. */
  readonly formClassName?: string;
  readonly pendingLabel: string;
  /**
   * The submit button's **treatment only**. `IN_FLIGHT` is appended below rather than
   * being part of this string, so a caller cannot lose the disabled-while-working
   * behaviour by supplying its own look — which is exactly what the first version of this
   * prop did: it defaulted to `` `${GHOST_RECOVERY} ${IN_FLIGHT}` ``, so
   * `create-list-form.tsx`'s pill silently dropped `IN_FLIGHT` and had to hand-roll the
   * same two `disabled:` classes to get it back. Two copies of one behaviour, one of them
   * invisible from here.
   *
   * Defaults to the ghost treatment every caller used before the linen redesign, and
   * defaulted rather than required for the same reason `Wordmark`'s name register is:
   * turn 9 redrew the Lists screen and did not redraw title detail's *Add to list*
   * dialog, so the caller it never touched keeps exactly what it had without being
   * edited to say so.
   */
  readonly submitClassName?: string;
  readonly toastTitle: (attemptedName: string) => string;
  readonly submit: (name: string) => Promise<ListNameOutcome>;
  readonly onCreated: (list: ListSummary) => void;
}) {
  const [name, setName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  const trimmed = name.trim();
  const disabled = inFlight || trimmed.length === 0;

  // A declaration, not a `useCallback`: handed to the toast as `retry`, and a `const`
  // cannot be referenced inside its own initialiser.
  async function attempt(nextName: string): Promise<void> {
    setInFlight(true);
    setDuplicate(false);

    const outcome = await submit(nextName);

    setInFlight(false);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setName("");
      onCreated(outcome.list);
      return;
    }

    if (outcome.reason === "duplicate") {
      setDuplicate(true);
      return;
    }

    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      title: toastTitle(nextName),
      reference: outcome.reference,
      retry: () => void attempt(nextName),
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (disabled) return;
    void attempt(trimmed);
  }

  return (
    <form onSubmit={onSubmit} className={`flex items-start gap-2.5 ${formClassName}`}>
      <div className={fieldClassName}>
        <label htmlFor={fieldId} className="sr-only">
          List name
        </label>
        {/* Turn 9's field: `44px` tall at a `12px` radius, `--raised` filled with the
            hairline inset as a shadow rather than drawn as a border — `search-surface.tsx`
            has the reason, which is that a `2px` focus border would move the contents of a
            fixed-height field by a pixel and an inset shadow costs no layout. */}
        <div className="field-well flex h-11 items-center px-3.5">
          <input
            id={fieldId}
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setDuplicate(false);
            }}
            maxLength={LIST_NAME_MAX_LENGTH}
            disabled={inFlight}
            placeholder="Name a new list"
            autoComplete="off"
            className={`bg-transparent text-note text-text placeholder:text-dim focus:outline-none ${inputClassName}`}
          />
        </div>

        {/* Stays `--accent` and stays under the field — unchanged by the redesign. */}
        {duplicate ? (
          <p role="alert" className="mt-2 text-item text-accent">
            You already have a list called &ldquo;{trimmed}&rdquo;.
          </p>
        ) : null}
      </div>

      {/* `IN_FLIGHT` here and not in `submitClassName`'s default — the dim and the
          wait-cursor are behaviour every treatment needs, so no caller gets the chance
          to leave them out. */}
      <button type="submit" disabled={disabled} className={`${submitClassName} ${IN_FLIGHT}`}>
        {inFlight ? pendingLabel : "New list"}
      </button>
    </form>
  );
}
