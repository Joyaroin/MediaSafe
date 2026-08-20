"use client";

import { useIsSelected } from "./bulk-selection-context";

/**
 * The mark that says a cell is in the selection — issue #197.
 *
 * ── Why the badge, and not a haptic ──────────────────────────────────────────────────
 *
 * The ticket names this as the load-bearing feedback rather than a decoration: *the badge
 * is what confirms the hold worked, because iOS Safari has no Vibration API and a haptic
 * is not available.* On every other platform this would be the second confirmation; here
 * it is the only one, which is why it arrives with an overshoot the eye cannot miss rather
 * than fading in.
 *
 * ── The arrival is CSS, and it has no exit ───────────────────────────────────────────
 *
 * `app/motion.ts`'s `bouncy` is the vocabulary for *visible overshoot — reserved for
 * arrival* and would ordinarily supply this spring. It does not, for `selectable-entry.tsx`'s
 * reason: this component renders inside a library cell and there are 472 of them on the
 * one screen that draws the whole library, so an `AnimatePresence` here is 472 Motion
 * components mounted to animate at most a handful of badges. `globals.css`'s `badge-arrive`
 * is the same movement at none of that cost.
 *
 * What the trade gives up is the **exit**, because a CSS animation cannot outlive the
 * element it is on. Nothing is lost that `app/motion.ts` values: *nothing can catch a
 * thing that is already leaving*, and a badge that disappears the instant the cell is
 * tapped is a deselection reported without delay.
 *
 * ── Why it is its own component and its own subscription ─────────────────────────────
 *
 * `library-entry-cell.tsx` is a Server Component and stays one. The badge is the only part
 * of a cell that has to know about the selection at render time, so it is the only part
 * that crosses to the client — the poster, the title, the year and the state line are
 * still server-rendered and still passed straight through.
 *
 * It subscribes on its own rather than being handed a boolean from `selectable-entry.tsx`
 * for the reason `useIsSelected` exists at all: a boolean per cell is compared by value, so
 * tapping one cell re-renders one cell.
 *
 * Renders nothing at all outside a selection provider, which on the desktop is always.
 */
export function SelectionCheckBadge({ libraryEntryId }: { libraryEntryId: string }) {
  const selected = useIsSelected(libraryEntryId);
  if (!selected) return null;

  return (
    <span
      // Sits on the poster's top-right corner, half over the artwork and half over the
      // card — the ticket's *a check badge on the poster*.
      //
      // `bg-ink`, not `bg-accent`. The ticket asks for the accent and `app/globals.css`
      // refuses it for selection; `selectable-entry.tsx`'s `SELECTED` has the argument in
      // full, and the short version is that this cell already paints **Watching** in the
      // accent a couple of centimetres below. Ink against a poster is if anything the
      // louder mark — it is the darkest value in the palette, and it lands on artwork
      // rather than on the linen everything else here sits on.
      className="badge-arrive pointer-events-none absolute -top-1.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink text-ground"
    >
      {/* Drawn rather than typed: a `✓` is a font's opinion and this one has to read at
          12px against vermilion at every weight the variable face resolves to. */}
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 6.4 4.8 8.7 9.5 3.6" />
      </svg>
    </span>
  );
}
