"use client";

import { PRIMARY_BUTTON } from "@/app/buttons";
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
 * ── The filled button, once it is armed ──────────────────────────────────────────────
 *
 * *New list* is the one control on Lists that makes anything, so it is the screen's filled
 * button (handoff §8.5) — but only once a name is typed. Until then it wears the
 * not-armed face, which `ListNameForm` applies itself, along with `IN_FLIGHT`.
 */
export function CreateListForm({
  onCreated,
}: {
  readonly onCreated: (list: ListSummary) => void;
}) {
  return (
    <ListNameForm
      fieldId="new-list-name"
      // `flex-1` on the field and `w-full` on the input: turn 9 gives the field the row
      // and puts the pill at its end, where the field used to be a fixed `w-48` inside a
      // wrapping form.
      fieldClassName="flex-1 min-w-0"
      inputClassName="w-full"
      pendingLabel="Creating"
      submitClassName={PRIMARY_BUTTON}
      toastTitle={(name) => name}
      submit={createListAction}
      onCreated={onCreated}
    />
  );
}
