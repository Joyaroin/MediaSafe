"use client";

import { referenceFor } from "@/errors/reference";
import {
  writeFailures,
  type WriteFailureHandle,
  type WriteFailureStore,
} from "@/errors/write-failure";
import {
  addTitlesToListAction,
  type AddTitlesToListActionOutcome,
} from "@/app/(signed-in)/lists/actions";

/**
 * *These ones* — which library titles the reader has held and tapped, and the one write
 * that files all of them at once. Issue #197, with no React in it.
 *
 * The directive above is the same safety boundary `watch-marks.ts` and
 * `errors/write-failure.ts` draw, for the same reason: everything below is state about
 * one reader's library, and module state on the server is shared by every request and so
 * by every account. Unlike those two this file exports no module-level instance — see the
 * closing section — but the boundary still belongs here, because the thing it protects is
 * the *state*, not the singleton.
 *
 * ── Why the rules live here and not in the cell ──────────────────────────────────────
 *
 * `vitest.config.mts` runs `environment: "node"`. A library cell is a poster, a
 * `pointerdown` and a half-second timer, and none of those exist in that harness — so a
 * rule written inside a cell is a rule nothing can check. The ticket says so in as many
 * words: *the cells stay thin. This is deliberate: the tiles cannot be rendered in the
 * test harness, so keeping logic out of them is what makes any of it testable.*
 *
 * So all four of the ticket's rules are here: what is selected, that emptying the
 * selection ends the mode, that the add is one write, and how a lost one is reported.
 * `selectable-entry.tsx` owns the gesture and nothing else; `selection-action-bar.tsx`
 * owns the bar's markup and nothing else. Both read this.
 *
 * ── One transaction, and why the store is where that is enforced ─────────────────────
 *
 * `addTitleToList` (`db/access.ts`) computes its position per call, so six sequential
 * calls would be six transactions and six round trips, and six parallel ones would race
 * `UNIQUE (list_id, position)` against each other. Worse, either shape can land four and
 * lose two, and there is no honest thing to put on screen after that: the reader asked one
 * question and would get six answers.
 *
 * So the store never loops. It calls `addTitlesToList` once with every selected title and
 * the whole set lands or none of it does (`db/access.ts`). *That* is what makes the
 * failure legible — **one lost write, one toast**, naming every title that did not make
 * it, and never one toast per title.
 *
 * ── Selection order is the order they land in ────────────────────────────────────────
 *
 * `selected` is an array rather than a `Set` because the order is a fact the write uses:
 * `addTitlesToList` assigns sequential positions in the order it is handed, so a reader
 * who holds *Severance* and then taps *Andor* finds them in that order in the list. A
 * `Set` would have given the same iteration order by accident of insertion; an array says
 * it on purpose, and `isSelected` is the only membership question anything asks.
 *
 * The array is **replaced, never mutated** — `useSyncExternalStore` compares snapshots by
 * identity, and a `read()` that built a fresh object each call would re-render for ever.
 * That identity does a second job below: it is how a retry knows whether the selection it
 * was started against is still the one on screen.
 *
 * ── There is no module-level instance ────────────────────────────────────────────────
 *
 * `watchMarks` is a singleton because a watch mark is shared by whichever surfaces happen
 * to be showing one episode, and nothing guarantees those sit in the same branch of the
 * tree. This is the opposite: a selection belongs to **one Library grid**, and whether it
 * is available at all is a question about where a cell sits — *is there a provider above
 * me* — because the desktop must not have one. `bulk-selection-context.ts` carries that
 * seam; a singleton would answer *yes* everywhere and there would be nothing left to ask.
 */

/**
 * One title a cell can put in the selection.
 *
 * Three fields and deliberately not the whole `LibraryEntryRow`: `libraryEntryId` is what
 * a cell is keyed and toggled by, `titleId` is what a list membership is keyed on
 * (`db/tables.ts` — a list holds titles, not library entries), and `name` is what the
 * toast prints if the write is lost. Nothing here needs a poster or a state.
 */
export interface SelectableTitle {
  readonly libraryEntryId: string;
  readonly titleId: string;
  readonly name: string;
}

/** What the action bar and the cells render. */
export interface BulkSelectionView {
  /**
   * Whether the mode is open. Not the same question as `selected.length > 0` today —
   * emptying the selection ends the mode, so the two move together — but they are two
   * facts and the bar reads this one, so that a later rule which keeps the mode open on an
   * empty selection would be a change to `toggle` rather than to every reader.
   */
  readonly selecting: boolean;
  readonly selected: readonly SelectableTitle[];
  /** A bulk add is on the wire. The bar's *Add to list* must not be pressed again. */
  readonly adding: boolean;
}

/**
 * The one write, behind an interface, so `tests/bulk-selection.test.ts` can drive every
 * route to it without a server, a session or a database. The shape is
 * `lists/actions.ts`'s own outcome rather than a parallel one: a fake that could answer
 * something the real caller cannot return would be a test of the fake.
 */
export interface BulkListWriter {
  add(params: {
    readonly listId: string;
    readonly titleIds: readonly string[];
  }): Promise<AddTitlesToListActionOutcome>;
}

export interface BulkSelection {
  subscribe(onChange: () => void): () => void;
  read(): BulkSelectionView;
  /** Cheap enough for 472 cells to each ask about themselves on every change. */
  isSelected(libraryEntryId: string): boolean;
  /** The hold landed — open the mode with this title selected. Idempotent. */
  hold(title: SelectableTitle): void;
  /** A tap while selecting: in if it is out, out if it is in. A no-op outside the mode. */
  toggle(title: SelectableTitle): void;
  /** *Done*, and everything else that ends the mode without acting. */
  end(): void;
  /**
   * File every selected title in one list, as one transaction. Resolves to whether the
   * write landed, which is what closes the picker — a failure leaves it open over a
   * selection that is still intact.
   */
  addToList(listId: string): Promise<boolean>;
}

/**
 * A selection that is not happening. Exported because `bulk-selection-context.ts` needs a
 * **stable identity** to hand `useSyncExternalStore` where there is no store at all —
 * a fresh object per call would re-render every desktop cell for ever.
 */
export const NO_SELECTION: BulkSelectionView = {
  selecting: false,
  selected: [],
  adding: false,
};

/**
 * Whether two snapshots say the same thing — the guard that keeps a no-op from becoming
 * 472 re-renders.
 *
 * `useSyncExternalStore` compares snapshots by identity, so handing out a fresh object for
 * a change that was not one re-renders every subscriber, and this store's subscribers are
 * every cell in the bill. `errors/write-failure.ts`'s `remove()` guards the same way for
 * the same reason (*every no-op becomes a re-render*); the difference is only that a
 * selection has three fields rather than one array.
 *
 * `selected` is compared element-wise rather than by identity because two of the routes
 * that reach `apply` build a fresh array to say nothing new — `end()` on an already-empty
 * selection, and a `toggle` that puts back exactly what it took. Comparing by identity
 * would let both through.
 */
function sameView(one: BulkSelectionView, other: BulkSelectionView): boolean {
  return (
    one.selecting === other.selecting &&
    one.adding === other.adding &&
    one.selected.length === other.selected.length &&
    one.selected.every((title, index) => title === other.selected[index])
  );
}

export function createBulkSelection({
  writer,
  failures = writeFailures,
}: {
  readonly writer: BulkListWriter;
  readonly failures?: WriteFailureStore;
}): BulkSelection {
  let view: BulkSelectionView = NO_SELECTION;
  const listeners = new Set<() => void>();

  /**
   * This selection's outstanding lost write, or `null`.
   *
   * One handle for the whole store rather than one per list, unlike
   * `add-to-list-control.tsx`'s `Map`: there is at most one bulk add in flight at a time
   * (`adding` below is what makes that true), so there is at most one bulk write to lose.
   */
  let raised: WriteFailureHandle | null = null;

  function apply(next: Partial<BulkSelectionView>): void {
    const merged = { ...view, ...next };
    if (sameView(merged, view)) return;
    view = merged;
    for (const listener of listeners) listener();
  }

  function indexOf(libraryEntryId: string): number {
    return view.selected.findIndex((title) => title.libraryEntryId === libraryEntryId);
  }

  /**
   * Put the selection somewhere, and end the mode if that somewhere is empty.
   *
   * The ticket's rule, in the one place every route to an empty selection passes through:
   * *the mode ends on Done, or when the last selected cell is deselected — an empty
   * selection has nothing to act on, so leaving the mode open would show a bar of dead
   * controls.* Written here rather than at each caller so that a future third way to
   * remove a title cannot forget it.
   */
  function settle(selected: readonly SelectableTitle[]): void {
    apply({ selected, selecting: selected.length > 0 });
  }

  /**
   * One attempt at the bulk write, against a set of titles captured when it started.
   *
   * A declaration rather than a `const`: it is handed to the toast as `retry`, and a
   * `const` cannot be referenced inside its own initialiser.
   */
  async function attempt(
    listId: string,
    titles: readonly SelectableTitle[],
  ): Promise<boolean> {
    apply({ adding: true });

    const outcome = await add(listId, titles);

    apply({ adding: false });

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing besides the reader that ever takes this toast down.
      raised?.resolve();
      raised = null;

      // Finishing the job finishes the mode — but only the job the reader is looking at.
      // A *Try again* pressed long after the fact can land against a selection that has
      // moved on since, and clearing that one would take away titles the reader chose
      // after this write was already lost. Identity is the whole test: the array is
      // replaced on every change, so `===` here means *nothing has touched the selection
      // since this attempt started*.
      if (view.selected === titles) settle([]);
      return true;
    }

    // One toast per lost write, not one per attempt — and `standing()` rather than a bare
    // null check, because the reader dismissing the first toast must not silence the
    // second (`errors/write-failure.ts`, issue #113).
    if (!raised?.standing()) {
      raised = failures.raise({
        // Every title that did not make it, named in full. There is no count here and no
        // truncation: the whole point of one transaction is that the reader is told
        // exactly what was lost, once, rather than being left to work out which four of
        // six landed.
        title: titles.map((title) => title.name).join(", "),
        reference: outcome.reference,
        retry: () => void attempt(listId, titles),
      });
    }

    return false;
  }

  /**
   * The one failure `addTitlesToListAction` cannot report itself, turned into the same
   * outcome shape: the request never reaching the server at all.
   */
  async function add(
    listId: string,
    titles: readonly SelectableTitle[],
  ): Promise<AddTitlesToListActionOutcome> {
    try {
      return await writer.add({
        listId,
        titleIds: titles.map((title) => title.titleId),
      });
    } catch (error) {
      return { ok: false, reference: referenceFor(error, { surface: "bulk-add-to-list" }) };
    }
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    read: () => view,

    isSelected: (libraryEntryId) => indexOf(libraryEntryId) !== -1,

    hold(title) {
      // Idempotent on purpose: a hold that lands on a cell already selected has nothing to
      // say. Toggling it off there would make the deepest gesture on the screen the one
      // that undoes itself.
      if (indexOf(title.libraryEntryId) !== -1) {
        apply({ selecting: true });
        return;
      }
      apply({ selecting: true, selected: [...view.selected, title] });
    },

    toggle(title) {
      // A tap outside the mode is a plain click, and `selectable-entry.tsx` has already
      // decided what one of those does. Guarding here as well as there is what keeps the
      // rule true of the store rather than of one caller.
      if (!view.selecting) return;

      const at = indexOf(title.libraryEntryId);
      if (at === -1) {
        settle([...view.selected, title]);
        return;
      }
      settle(view.selected.filter((_, index) => index !== at));
    },

    end: () => settle([]),

    addToList(listId) {
      const titles = view.selected;
      // Nothing to write. The bar cannot reach this — an empty selection has already
      // ended the mode — but `addToList` is a public route into a transaction and an
      // empty `VALUES` list is not something to send and find out about.
      if (titles.length === 0) return Promise.resolve(false);
      // A second press while the first is on the wire is not a second write. It cannot be
      // a retry either: this one has not failed yet.
      if (view.adding) return Promise.resolve(false);
      return attempt(listId, titles);
    },
  };
}

/**
 * The store the Library's phone grid actually runs on — the real Server Action behind it.
 *
 * A factory call rather than a module-level instance, made by
 * `bulk-selection-provider.tsx` once per mounted grid: see this file's opening docblock
 * for why a selection is not the kind of state that wants a singleton.
 */
export function createLibraryBulkSelection(): BulkSelection {
  return createBulkSelection({
    writer: {
      add: ({ listId, titleIds }) => addTitlesToListAction(listId, titleIds),
    },
  });
}
