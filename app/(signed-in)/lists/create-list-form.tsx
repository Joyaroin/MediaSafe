"use client";

import { useRef, useState } from "react";

import { LIST_NAME_MAX_LENGTH, type ListSummary } from "@/db/access";
import { IN_FLIGHT, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { createListAction } from "./actions";

/**
 * Make a list, and name it — issue #146. The one control that is always on screen,
 * whether the account has zero lists or several, because #146's own words are *creating a
 * new list is available in the same action* rather than a separate errand.
 *
 * ── Two ways this can fail, and they are not the same fact ─────────────────────────────
 *
 * A duplicate name is not a lost write — the server answered, plainly, that this account
 * already has a list called that. It is shown inline, under the field, the same register
 * the field's own validation would use, and it clears the moment the reader edits the
 * name. An unreadable server — the connection dropping, the database unreachable — is a
 * lost write in `AGENTS.md`'s sense and gets that treatment instead: the standing toast,
 * never auto-dismissed, carrying a reference id.
 *
 * ── No optimistic row ────────────────────────────────────────────────────────────────
 *
 * Unlike `display-name-control.tsx`, this never shows a list that has not landed: the row
 * needs the server's id (it is what the delete control keys on), so `onCreated` fires only
 * from a `{ ok: true }` outcome. The field disables meanwhile, which is the write's own
 * in-flight indicator.
 */
export function CreateListForm({
  onCreated,
}: {
  readonly onCreated: (list: ListSummary) => void;
}) {
  const [name, setName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  const trimmed = name.trim();
  const disabled = inFlight || trimmed.length === 0;

  // A declaration, not a `useCallback`: handed to the toast as `retry`, and a `const`
  // cannot be referenced inside its own initialiser. Same shape as
  // `display-name-control.tsx`'s `attempt`.
  async function attempt(nextName: string): Promise<void> {
    setInFlight(true);
    setDuplicate(false);

    const outcome = await createListAction(nextName);

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
      title: nextName,
      reference: outcome.reference,
      retry: () => void attempt(nextName),
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (disabled) return;
    void attempt(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-3">
      <div>
        <label htmlFor="new-list-name" className="sr-only">
          List name
        </label>
        <div className="border border-rule-bold px-3 py-2 focus-within:border-signal">
          <input
            id="new-list-name"
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
            className="w-48 bg-transparent text-item text-stock placeholder:text-stock-dim focus:outline-none"
          />
        </div>

        {duplicate ? (
          <p role="alert" className="mt-2 text-item text-signal">
            You already have a list called &ldquo;{trimmed}&rdquo;.
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={disabled} className={`${SOLID_RECOVERY} ${IN_FLIGHT}`}>
        {inFlight ? "Creating" : "New list"}
      </button>
    </form>
  );
}
