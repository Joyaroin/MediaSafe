"use client";

import { startTransition, useCallback, useMemo, useState } from "react";

import { LibrarySelectionProvider } from "./library-selection";
import { ProgrammeNotePane } from "./programme-note";

/**
 * **A surface on the left, the programme note on the right, and which entry is open between
 * them** — the Never-Navigate-Away Rule as one component, so the two surfaces that
 * follow it cannot follow it differently.
 *
 * Extracted in #137, which is the ticket that made it two. The library bill has had this
 * shape since #58; the desktop Up next rails needed the same one — *"the panel is the one
 * that already exists on the Library page"* — and the three parts a caller would otherwise
 * have restated are all load-bearing:
 *
 *  - **The `<main>` and its axis.** `lg:flex-row` is what makes the pane a column beside the
 *    surface rather than a block under it, and `min-w-0` on the left child (the caller's,
 *    since only the caller knows what it wraps) is what stops a long title widening the page.
 *  - **The selection state.** One `useState` per page instance, never a URL segment: on
 *    desktop the URL does not change when a tile is picked, which is the whole point of the
 *    rule. `library-selection.tsx`'s docblock has the reasoning.
 *  - **The pane itself.** `ProgrammeNotePane` renders only past `lg` and reads nothing but
 *    the context above, so a second surface needs a second provider and no second pane.
 *
 * A caller passes the left-hand column as `children` and nothing else. It stays in the
 * `library/` folder because the pane it wraps does, and moving either would put the state
 * further from the one component that reads it.
 *
 * `select` wraps the state write in `startTransition` — issue #141's whole reason for
 * being here rather than staying the plain `setSelectedEntryId` it was before: a regular
 * `setState` never activates a `<ViewTransition>`, only a Transition does
 * (`programme-note.tsx`'s docblock has the rest of the morph).
 */
export function ProgrammeNoteLayout({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<{
    entryId: string;
    posterPath: string | null;
  } | null>(null);

  /**
   * **Stable across every render this component will ever have.** `select` used to be a
   * plain function declaration and the value below a fresh object literal, which meant the
   * context handed every consumer a new identity on *any* re-render of this component —
   * not merely on the one thing consumers care about, which is the selection changing.
   *
   * Today that costs nothing, because a selection change is the only thing that re-renders
   * this component. It is pinned anyway because the next piece of state added here — and
   * this is the layout two whole surfaces are built on — would otherwise fan out silently
   * to every cell in a 472-title grid and every tile in the rails, with nothing on screen
   * and no test saying so.
   */
  const select = useCallback((entryId: string, posterPath: string | null = null) => {
    startTransition(() => setSelection({ entryId, posterPath }));
  }, []);

  /**
   * ── Why this is a memoised context and not an external store ────────────────────────
   *
   * `bulk-selection-context.ts` solves what looks like the identical problem one file over
   * — *a tap re-renders the cell whose badge changed instead of all 472 of them* — by
   * putting a stable store object in the context and letting each cell subscribe to its own
   * boolean through `useSyncExternalStore`. The obvious move is to do the same here. It is
   * the wrong move, and the reason is the morph.
   *
   * `select` wraps its write in `startTransition` because **a regular `setState` never
   * activates a `<ViewTransition>`, only a Transition does** — that is #141's whole reason
   * for this function existing, and the poster morph is what it buys. An external store
   * does not participate in that: React cannot defer a `useSyncExternalStore` update, so
   * the subscribers would render at synchronous priority, outside the Transition, and the
   * `<ViewTransition>` would have nothing to activate on. The morph would simply stop
   * happening — silently, and on the one interaction it was built for.
   *
   * So the two selections are deliberately implemented differently, and the difference is
   * not an oversight: bulk selection has no transition to preserve and can have the cheaper
   * fan-out; this one has a morph and pays a shallow re-render for it. The re-render *is*
   * shallow — `SelectableEntry` renders `{children}`, and those children are server-rendered
   * elements whose identity does not change, so React skips the poster and the cell body
   * and re-runs the wrapper alone.
   */
  const value = useMemo(
    () => ({
      selectedEntryId: selection?.entryId ?? null,
      selectedPosterPath: selection?.posterPath ?? null,
      select,
    }),
    [selection, select],
  );

  return (
    <LibrarySelectionProvider value={value}>
      <main className="flex w-full flex-1 flex-col lg:flex-row">
        {children}
        <ProgrammeNotePane />
      </main>
    </LibrarySelectionProvider>
  );
}
