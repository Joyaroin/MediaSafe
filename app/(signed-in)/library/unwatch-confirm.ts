/**
 * The number `watch-menu.tsx`'s confirmation puts in front of the reader before *Unwatch*
 * does anything — issue #315.
 *
 * ── Why this is a pure function, tested apart from the dialog ────────────────────────
 *
 * `watch-menu.tsx`'s own `useEffect(() => ref.current?.showModal())` throws in jsdom, so
 * nothing about that dialog is exercised by rendering it (`tests/watch-menu-sweep.test.ts`'s
 * own docblock is where that wall is first hit). Pulling the one piece of the confirmation
 * that is actually a rule — *how many watches does this sentence name* — out into a module
 * with no React in it is what `mark-up-to.ts` already does for the same reason, and this is
 * the same shape: `tests/unwatch-confirm.test.ts` drives it directly, with a plain number.
 *
 * ── Why `1` is drawn here and `markUpToCount` never draws it ──────────────────────────
 *
 * `mark-up-to.ts`'s `markUpToCount` hides a count of one, because *watched up to here* is
 * only ever offered where at least one **earlier** episode is unwatched — a count of one
 * there is a control that should not have been drawn (`coveredUpTo`'s own rule). Unwatch
 * has no such floor: a single watch, the ordinary case for almost every watched episode, is
 * exactly what most presses of *Unwatch* remove, and a confirmation that fell silent on the
 * most common count would be the one time it had the least to say.
 *
 * The `en-GB` grouping is still borrowed from the same place `markUpToCount` borrowed it —
 * `lists/title-count.ts`'s `formatTitleCount` — for its own stated reason: a formatting
 * difference between two confirmations that count things is not something anyone would ever
 * read side by side to catch.
 */
export function unwatchCount(watches: number): string {
  if (watches === 1) return "1 watch";
  return `${watches.toLocaleString("en-GB")} watches`;
}
