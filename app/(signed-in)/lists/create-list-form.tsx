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
 * ── A vermilion pill, reversing this file's own `GHOST_RECOVERY` argument ─────────────
 *
 * This used to read: *`errors/recovery-buttons.ts` reserves solid `accent` for the one
 * primary recovery action on a surface, and `globals.css` narrows the accent further
 * still — it is reserved for recording a watch. `New list` is neither.* The linen
 * redesign restates the reservation rather than dropping it, and the restatement is what
 * changes the answer: the accent marks what is live **and the one primary action of a
 * screen**, one per screen and never two (`app/globals.css` holds the rule in full).
 *
 * `New list` is that action here. It is the only control on the Lists screen that makes
 * anything, the screen exists to be able to press it, and nothing else on it is vermilion
 * — `Delete` is deliberately a quiet underlined word, which is the other half of the same
 * decision. The premise that has actually changed is *recovery-only*: the treatment was
 * never really about recovery, it was about primacy, and `errors/recovery-buttons.ts`'s
 * own closing note says these constants are *"not errors-only; they are only errors-only
 * today"*.
 *
 * Written out here rather than as `SOLID_RECOVERY`, because turn 9's pill is a different
 * shape from that constant — `44px` at a `22px` radius against `0.5rem 1rem` and no
 * radius at all — and bending the shared string into this would restyle the toast's *Try
 * again* and `Bring your library in` on surfaces the handoff never drew.
 *
 * The treatment only: `ListNameForm` appends `IN_FLIGHT` itself, so the disabled dim and
 * the wait-cursor are not this string's to remember.
 */
const NEW_LIST_PILL =
  "flex h-11 shrink-0 items-center rounded-[var(--radius-full)] bg-accent px-[18px] text-item font-semibold text-accent-ink transition-[filter] duration-200 hover:brightness-95";

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
      submitClassName={NEW_LIST_PILL}
      toastTitle={(name) => name}
      submit={createListAction}
      onCreated={onCreated}
    />
  );
}
