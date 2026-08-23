import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The hold has left the Up next tab — issue #220, and the half of it that fails silently.
 *
 * ── What is being guarded ────────────────────────────────────────────────────────────
 *
 * #194 scoped hold-to-select to the Up next tracks, the group screens and the Library
 * grid, and #198 shipped the Up next half. #220 withdraws it from the **home surface
 * only**, because a tile carrying tap-to-open, tap-to-mark and hold-to-select is three
 * meanings on one card. The withdrawal is one line: `up-next-groups.tsx` no longer mounts
 * a `BulkSelectionProvider`, so `useBulkSelection()` under it is `null` and the gesture is
 * inert — **availability is a fact about the tree**, which is the device #197 chose
 * precisely so this would be a mount rather than a media query.
 *
 * That is exactly why it needs a test. Re-adding the provider would restore the gesture
 * with no type error, no failing assertion anywhere else, and nothing visible until
 * somebody's thumb rested on a tile — and the two surfaces that must **keep** it would
 * look no different from the one that must not.
 *
 * ── Why this reads source rather than rendering ──────────────────────────────────────
 *
 * `tests/bulk-abandon-surfaces.test.ts`'s reason, unchanged: `GroupTile` imports React's
 * `ViewTransition`, which the installed React does not export — Next supplies it at build
 * time — so nothing on this surface renders in this harness. Reading the source is what is
 * left, and the coupling here is between a file and a provider it must or must not mount,
 * which source text expresses exactly.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

describe("the Up next tab mounts no selection provider", () => {
  const source = sourceAt("app/(signed-in)/up-next/up-next-groups.tsx");

  it("neither imports nor renders BulkSelectionProvider", () => {
    // Both halves, because either one alone is a half-finished revert: an import with no
    // mount is dead code that reads like the gesture is still here, and a mount with no
    // import does not compile but would not be caught by an import-only assertion.
    expect(source).not.toMatch(/from "@\/app\/\(signed-in\)\/library\/bulk-selection-provider"/);
    expect(source).not.toMatch(/<BulkSelectionProvider/);
  });

  it("still mounts the title sheet, which is the tap this surface keeps", () => {
    // The withdrawal is of the hold, not of the tap. A tile still opens the title over
    // the tab rather than navigating into the Library (#136, #171).
    expect(source).toMatch(/<TitleSheetProvider>/);
  });
});

describe("the surfaces that keep the hold still mount one", () => {
  it("the five group screens behind More", () => {
    const source = sourceAt("app/(signed-in)/up-next/group-screen.tsx");
    expect(source).toMatch(/<BulkSelectionProvider>/);
  });

  it("the Library grid", () => {
    const source = sourceAt("app/(signed-in)/library/library-surface.tsx");
    expect(source).toMatch(/<BulkSelectionProvider>/);
  });
});

describe("the gesture itself is untouched", () => {
  it("GroupTile still runs the shared hold hook, for the screens that still provide one", () => {
    // The tile is not forked into a holding and a non-holding copy: #198's shared hook
    // stays, and `bulk === null` is what makes it inert on the home. A branch here would
    // be a second answer to *is this surface selectable* beside the tree's.
    const source = sourceAt("app/(signed-in)/up-next/group-tile.tsx");
    expect(source).toMatch(/useHoldToSelect\(bulk, title\)/);
  });

  it("the Library cell still runs it", () => {
    const source = sourceAt("app/(signed-in)/library/selectable-entry.tsx");
    expect(source).toMatch(/useHoldToSelect\(/);
  });
});

/**
 * *A hold on a list card does nothing*, and *list detail rows keep the hold unchanged* —
 * two of #220's acceptance criteria that are satisfied by absence.
 *
 * They are asserted rather than assumed because absence is what a later ticket adds to
 * without noticing. #215 puts the reason on the record: selection exists to act on several
 * **titles**, and a list is a destination — an action bar offering *Add to list* and
 * *Abandon* means nothing for one. A reorderable row already owns the press it has
 * (`[listId]/drag-handle-icon.tsx`, issue #149), and a hold competing with a drag is the
 * three-meanings problem in a second place.
 */
describe("a hold on a list does nothing", () => {
  it("a list card carries no hold gesture and no selection", () => {
    const source = sourceAt("app/(signed-in)/lists/list-row.tsx");
    expect(source).not.toMatch(/useHoldToSelect|useBulkSelection|BulkSelectionProvider/);
  });

  it("a list's own detail rows carry none either", () => {
    for (const file of [
      "app/(signed-in)/lists/[listId]/list-title-row.tsx",
      "app/(signed-in)/lists/[listId]/reorderable-title-list.tsx",
    ]) {
      expect(sourceAt(file)).not.toMatch(
        /useHoldToSelect|useBulkSelection|BulkSelectionProvider/,
      );
    }
  });
});

/**
 * The mark control is on Ongoing and on nothing else — #220's first acceptance criterion,
 * and the one #138 spent three files telling the next builder not to add.
 *
 * A mark on Watchlist would turn one tap into *start this show*; on Abandoned it would
 * silently clear the one hand-set state in this application. Neither throws, neither fails
 * a type check, and both look like a tidy generalisation of `HomeGroup` from the outside.
 */
describe("only Ongoing records a watch", () => {
  const source = sourceAt("app/(signed-in)/up-next/up-next-groups.tsx");

  it("renders OngoingGroup for Ongoing and HomeGroup for the other four", () => {
    expect(source).toMatch(/<OngoingGroup entries=\{rails\.ongoing\}/);
    // Four `HomeGroup`s and no fifth, so a mark cannot arrive on one of them by a tile
    // swap that nothing else notices.
    expect(source.match(/<HomeGroup\b/g)).toHaveLength(4);
    expect(source).not.toMatch(/<OngoingGroup[\s\S]*<OngoingGroup/);
  });

  it("keeps the mark off the group screens, which keep the hold instead", () => {
    // `/up-next/ongoing` is the same group behind *More*, and it renders plain tiles: the
    // mark and the hold are never on one card, whichever surface that card is on.
    const screen = sourceAt("app/(signed-in)/up-next/group-screen.tsx");
    expect(screen).not.toMatch(/OngoingTile|useUpNextMark/);
  });
});
