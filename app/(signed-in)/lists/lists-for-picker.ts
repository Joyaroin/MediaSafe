import type { ListSummary } from "@/db/access";

/**
 * This account's lists, for the *Add to list* picker to render — the add-to-list control
 * on title detail (#147) and the bulk selection bar (#197), both reading the same
 * question through `GET /api/lists/picker` rather than a Server Action (issue #481).
 *
 * Moved here, unchanged, from `lists/actions.ts`'s own `listsForPickerAction`, which this
 * type used to be the return shape of: a plain read, so the only failure worth naming is
 * the request never landing at all — there is no duplicate or validation case here, the
 * way `createList` has one.
 */
export type ListsForPickerOutcome =
  | { readonly ok: true; readonly lists: readonly ListSummary[] }
  | { readonly ok: false; readonly reference: string | null };
