"use client";

import type { LibraryState } from "@/db/access";
import { GHOST_RECOVERY, IN_FLIGHT } from "@/errors/recovery-buttons";
import { useAbandon } from "./use-abandon";

/**
 * The one hand-set state in the model, and the way back out of it — issue #87.
 * `DESIGN.md`'s Abandon Control section used to bind this row to a dim underlined text
 * button, no border, no fill, no icon, and never accent in any state. Issue #195 moves it
 * onto `GHOST_RECOVERY` — accent border, accent text, solid on hover — the same register
 * every other control in that conversion takes, spent here knowingly rather than by
 * accident (`DESIGN.md` §12 owes a ticket to settle what the accent means; this adds to
 * that question rather than resolving it). Issue #139 drops the row's own hairline top —
 * title detail's new-world treatment separates its blocks by gap alone.
 *
 * ── One row, both directions ──────────────────────────────────────────────────────────
 *
 * `abandoned` says which of the two writes a press means, and the caller decides what
 * `onChanged` does with a landed one — the programme note patches its own `state` field,
 * and a future Up next card (`DESIGN.md`: "the same control in a second place, not a
 * second design") is free to do something else entirely, which is what makes this
 * reusable there without a second implementation. `onChanged` is handed the entry id
 * alongside the new state precisely so a caller juggling more than one entry — the
 * desktop pane, which never navigates away while a write is still in flight — can tell a
 * landed write apart from a stale one and ignore the latter.
 *
 * ── Optimistic, the same shape as the search screen's add ────────────────────────────
 *
 * `catalogue-result.tsx` (issue #55) is the write-failure toast's first caller and the
 * pattern this follows: `optimistic` flips the row the instant it is pressed, before the
 * server has answered, and a failure puts it back — `SPEC.md` §3.3's *a lost write is
 * never silent*, and the acceptance criterion's own words for it, *the row goes back*.
 * `null` defers to the caller's own `abandoned` prop; a press overrides it until the write
 * settles one way or the other, which also doubles as the row's own in-flight indicator —
 * there is no separate `pending` flag to keep in step with it.
 *
 * What is never guessed is the **exact** state a successful un-abandon lands on — that
 * would be re-deriving the five-state rule in TypeScript, which `db/access.ts`'s
 * `unabandonTitle` exists precisely so nothing here has to. Only the row's own boolean —
 * abandoned or not — is optimistic; the state line elsewhere on the page catches up the
 * moment `onChanged` reports what the view actually says.
 *
 * ── No margin of its own — issue #228 ─────────────────────────────────────────────────
 *
 * This used to open its own `PROGRAMME_NOTE_SECTION` gap, back when it stood alone at the
 * foot of the pane. It is now the second child of the state row `programme-note-content.tsx`
 * builds — *where the show stands* on one side, this on the other — so the gap above that
 * row is that component's to set, and a second one written here would be added on top of
 * it. This is still `AbandonControl`'s only caller, so nothing else loses a margin it needs.
 */
export function AbandonControl({
  libraryEntryId,
  titleName,
  abandoned,
  onChanged,
}: {
  readonly libraryEntryId: string;
  readonly titleName: string;
  readonly abandoned: boolean;
  readonly onChanged: (libraryEntryId: string, state: LibraryState) => void;
}) {
  /**
   * The write moved to `use-abandon.ts` when the hero's *Where this stands* menu became a
   * second place to press it. Everything it used to do here it still does — the optimistic
   * flip, one toast per lost write, `resolve()` on the write that lands — and it now does
   * it once for both callers rather than twice.
   */
  const { abandoned: shown, pending, toggle } = useAbandon({
    libraryEntryId,
    titleName,
    abandoned,
    onChanged,
  });

  return (
    <div className="flex items-baseline justify-between gap-4">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={shown ? `Take back giving up on ${titleName}` : `Give up on ${titleName}`}
        className={`${GHOST_RECOVERY} ${IN_FLIGHT}`}
      >
        {shown ? "Take it back" : "Give up on this"}
      </button>

      {/* `DESIGN.md`: the reassurance sits opposite, as a dim code line, only where it is
          the true statement — there is nothing left to reassure once it is abandoned. */}
      {shown ? null : (
        <span className="code-line text-dim">Watching it again clears it</span>
      )}
    </div>
  );
}
