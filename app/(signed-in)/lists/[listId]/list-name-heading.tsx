"use client";

import { useRef, useState } from "react";

import { PRIMARY_BUTTON_COMPACT, SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { renameListAction, type RenameListActionOutcome } from "@/app/(signed-in)/lists/actions";
import { LIST_NAME_MAX_LENGTH } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";

/**
 * A list's name, and the way to change it — issue #357; a typo in a list name used to be
 * permanent.
 *
 * *Rename* turns the heading into a field in place. A name another of this account's lists
 * already has is the reader's to fix, so it is said beside the field and nothing is sent
 * again; a lost write raises the write-failure toast and puts the old name back. The new
 * name shows as soon as it is saved, and the lists read's cache is busted by the action.
 */
export function ListNameHeading({
  listId,
  initialName,
}: {
  readonly listId: string;
  readonly initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  async function save(next: string): Promise<void> {
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed === name) {
      setEditing(false);
      return;
    }

    const before = name;
    setPending(true);
    setDuplicate(false);
    setName(trimmed);

    const outcome = await rename(listId, trimmed);
    setPending(false);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setName(outcome.name);
      setEditing(false);
      return;
    }

    setName(before);

    if (outcome.reason === "duplicate") {
      setDuplicate(true);
      return;
    }

    setEditing(false);
    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      title: before,
      reference: outcome.reference,
      retry: () => void save(trimmed),
    });
  }

  if (!editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="bill-title text-bill-sm text-text">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setDuplicate(false);
            setEditing(true);
          }}
          aria-label={`Rename ${name}`}
          className={SECONDARY_BUTTON_COMPACT}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft);
      }}
    >
      <label className="field-well flex h-10 min-w-0 flex-1 items-center px-3.5 sm:max-w-[360px]">
        <span className="sr-only">List name</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDuplicate(false);
          }}
          maxLength={LIST_NAME_MAX_LENGTH}
          autoFocus
          aria-invalid={duplicate}
          aria-describedby={duplicate ? "rename-duplicate" : undefined}
          className="w-full bg-transparent text-item text-text focus:outline-none"
        />
      </label>
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON_COMPACT}>
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className={SECONDARY_BUTTON_COMPACT}
      >
        Cancel
      </button>
      {duplicate ? (
        <p id="rename-duplicate" role="alert" className="w-full text-meta text-accent">
          You already have a list with that name.
        </p>
      ) : null}
    </form>
  );
}

async function rename(listId: string, name: string): Promise<RenameListActionOutcome> {
  try {
    return await renameListAction(listId, name);
  } catch (error) {
    return { ok: false, reason: "failed", reference: referenceFor(error, { surface: "lists" }) };
  }
}
