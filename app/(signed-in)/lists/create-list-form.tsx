"use client";

import type { ListSummary } from "@/db/access";
import { createListAction } from "./actions";
import { ListNameForm } from "./list-name-form";

/**
 * Make a list, and name it — issue #146. The one control that is always on screen,
 * whether the account has zero lists or several, because #146's own words are *creating a
 * new list is available in the same action* rather than a separate errand.
 *
 * The field, the duplicate-name message and the optimistic write are `list-name-form.tsx`
 * — issue #147's *Add to list* dialog needs the identical interaction to name a list from
 * title detail, and this is the caller that fixed the shared shape's two per-caller
 * questions first: the write is `createListAction` (unwrapped — this screen has always
 * let a transport failure surface as an unhandled rejection rather than the toast's
 * `"failed"` path, and this refactor preserves that rather than widening it), and the
 * toast, on loss, names the list itself — `(name) => name` — because there is no other
 * title on this screen for it to name instead.
 *
 * ── `GHOST_RECOVERY`, not `SOLID_RECOVERY` ──────────────────────────────────────────────
 *
 * `errors/recovery-buttons.ts` reserves solid `accent` for *the one primary recovery
 * action* on a surface — `Bring your library in`, a toast's `Try again` — and
 * `globals.css` narrows the accent further still: it is reserved for recording a watch.
 * `New list` is neither: it is an everyday, always-on control, not a recovery from a
 * failure and not the one irreversible authored moment `delete-account-form.tsx` widens
 * the treatment for. It stays at the ghost treatment every other secondary action uses —
 * `list-name-form.tsx`'s own submit button.
 */
export function CreateListForm({
  onCreated,
}: {
  readonly onCreated: (list: ListSummary) => void;
}) {
  return (
    <ListNameForm
      fieldId="new-list-name"
      inputClassName="w-48"
      pendingLabel="Creating"
      toastTitle={(name) => name}
      submit={createListAction}
      onCreated={onCreated}
    />
  );
}
