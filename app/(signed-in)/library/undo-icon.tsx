/**
 * The circular undo arrow — the glyph that replaces the word *Undo* in the episode row's
 * trailing slot.
 *
 * One filled path rather than a stroked arc plus a stroked arrowhead, which is
 * `CheckmarkIcon`'s own rule in this directory and `MarkUpToIcon`'s beside it: a stroked
 * path scales its weight with the box, so the same icon drawn at `16px` here and at any
 * other size later would be two different weights of the same mark. A filled shape is one
 * shape at every size.
 *
 * `viewBox="0 0 24 24"` and `fill="currentColor"`, so it takes the colour of whichever
 * glyph treatment wraps it — `RECORDING_GLYPH`'s accent while an undo is offered.
 *
 * ── Why the row draws this and not the word ─────────────────────────────────────────
 *
 * The trailing slot is `w-11` in every state now (`episode-line.ts`), and the point of
 * that is that it never changes width: a `62px` text pill appearing on the row a reader
 * just pressed would reflow the episode **name** beside it for as long as the undo is
 * offered, on the one row they are looking at. The card on Up next has room for the word
 * and keeps it; this row does not and takes the glyph.
 */
export function UndoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"
        fill="currentColor"
      />
    </svg>
  );
}
