"use client";

import { useRef, useState } from "react";

import { PLAIN_BUTTON, PRIMARY_BUTTON } from "@/app/buttons";
import { renameListAction, type RenameListActionOutcome } from "@/app/(signed-in)/lists/actions";
import { LIST_NAME_MAX_LENGTH } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";

/**
 * A list's name, and the way to change it — issue #357; a typo in a list name used to be
 * permanent.
 *
 * *Rename*, from the page's three-dot menu (Charcoal, handoff §8.5), turns the heading into
 * a field in place. The name and whether it is being edited belong to
 * `list-detail-surface.tsx`, because the menu that starts a rename and the take-off toast
 * that names the list both sit outside this component. A name another of this account's lists
 * already has is the reader's to fix, so it is said beside the field and nothing is sent
 * again; a lost write raises the write-failure toast and puts the old name back. The new
 * name shows as soon as it is saved, and the lists read's cache is busted by the action.
 */
export function ListNameHeading({
  listId,
  name,
  onNameChange: setName,
  editing,
  onEditingChange: setEditing,
}: {
  readonly listId: string;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly editing: boolean;
  readonly onEditingChange: (editing: boolean) => void;
}) {
  // Seeded each time editing starts: the surface mounts this form afresh per rename.
  const [draft, setDraft] = useState(name);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);
  // The name as it stands, for a retry that runs after later renders have moved on.
  const current = useRef(name);
  current.current = name;

  async function save(next: string): Promise<void> {
    const trimmed = next.trim();
    const before = current.current;
    if (trimmed.length === 0 || trimmed === before) {
      setEditing(false);
      return;
    }

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
    return <h1 className="screen-title text-screen break-words text-text">{name}</h1>;
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft);
      }}
    >
      <label className="field-well flex h-12 min-w-0 flex-1 items-center px-3.5 sm:max-w-[360px]">
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
          className="w-full bg-transparent text-bill-xs text-text focus:outline-none"
        />
      </label>
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className={PLAIN_BUTTON}>
        Cancel
      </button>
      {duplicate ? (
        <p id="rename-duplicate" role="alert" className="w-full text-item font-medium text-danger">
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
