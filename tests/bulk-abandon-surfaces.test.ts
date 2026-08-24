import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * *Which of these have I already given up on* — the fact bulk Abandon branches on, at the
 * three places it enters a selection. Issue #199.
 *
 * ── What fails silently without this ─────────────────────────────────────────────────
 *
 * `tests/bulk-selection.test.ts` proves the rule: a press abandons the titles that are not
 * already abandoned and leaves the rest alone. It proves it over `SelectableTitle` values
 * the test writes itself, which is the right seam for a rule but says nothing about where
 * the real `abandoned` comes from. If a surface stops supplying it, every one of those
 * tests still passes, TypeScript still compiles — `abandoned` is required on
 * `SelectableTitle`, but `false` is a perfectly good boolean — and the store cheerfully
 * decides a screen full of abandoned titles has work to do.
 *
 * The damage is bounded and worth being precise about, because it is the reason this file
 * asserts rather than shrugs: `abandonTitles` filters on the row's own `abandoned_at`
 * inside the transaction, so nothing is ever un-abandoned or re-stamped by the gap. What
 * breaks is the ticket's own rule — *a selection where every title is already abandoned
 * makes the action a no-op* would hold only because Postgres declined the work, not
 * because the store never asked for it, and the reader would get a round trip and a
 * cleared selection for a press that meant nothing.
 *
 * `/up-next/abandoned` is the sharp case and the one that was actually missing: it is the
 * one screen made **entirely** of abandoned titles, so a surface that forgets the fact
 * there gets every tile on it wrong.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * `tests/phone-groups-scroll.test.ts`'s reason, unchanged: `GroupTile` imports React's
 * `ViewTransition`, which the installed React does not export — Next supplies it at build
 * time — so nothing on that surface renders in this harness. `LibraryEntryCell` is a
 * poster and a hold gesture and does not render here either
 * (`app/(signed-in)/library/bulk-selection.ts` opens with the argument). Reading the
 * source is what is left.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

describe("the Library cell hands its own abandoned state to the selection", () => {
  const source = sourceAt("app/(signed-in)/library/library-entry-cell.tsx");

  it("puts abandoned in the SelectableTitle it builds", () => {
    // The cell already computes `abandoned` for its dimming and its state line. The
    // selection gets that one, not a second derivation.
    expect(source).toMatch(/const abandoned = entry\.state === "abandoned"/);
    // `[^}]*` rather than a lazy `[\s\S]*?`: it cannot cross the closing brace, so this
    // cannot be satisfied by the word turning up somewhere else in the file.
    expect(source).toMatch(/title=\{\{[^}]*\babandoned,/);
  });
});

/**
 * **The two Up next entry points are gone, and their cases went with them** — #250.
 *
 * `group-tile.tsx` built a `SelectableTitle`, and the five group screens forwarded
 * `abandoned` into it — `/up-next/abandoned` being the sharp one, the single screen made
 * **entirely** of abandoned titles, where a surface that forgot the fact got every tile on
 * it wrong. All seven files were deleted along with the five vertical groups.
 *
 * The phone's two rails are not selection surfaces at all: an episode card carries a check
 * and a link, a film card carries a link, and neither ever builds a `SelectableTitle`. So
 * #198's withdrawal of the hold from Up next is structural now rather than a rule anything
 * has to keep, and the Library cell above is the one entry point left. Bulk Abandon reaches
 * it from `/library`, whose status filters are also where the two states those groups
 * showed remain reachable.
 *
 * The case below is what would catch a **new** surface arriving without the fact, which is
 * the failure a file-by-file list cannot see — and it is why the list of surfaces this file
 * used to keep is not simply shortened by two.
 */
describe("no other surface builds a selection without the abandoned fact", () => {
  it("finds every SelectableTitle builder, and none of them omits it", () => {
    const builders = sourceFiles(path.join(REPOSITORY_ROOT, "app")).filter((file) =>
      // A file that only *types* against `SelectableTitle` — the context, the store —
      // never writes an object literal for one, so it is not asked the question.
      /title=\{\{|: SelectableTitle = \{/.test(readFileSync(file, "utf8")),
    );

    // A floor against the search quietly matching nothing and passing — the failure mode
    // every `toEqual([])` in this repository is written to avoid.
    expect(builders.length).toBeGreaterThan(0);

    for (const file of builders) {
      const relative = path.relative(REPOSITORY_ROOT, file);
      const supplies = /\babandoned,/.test(readFileSync(file, "utf8"));
      expect({ file: relative, supplies }).toEqual({ file: relative, supplies: true });
    }
  });
});

/** Every `.ts`/`.tsx` under a directory — `tests/remove-from-library-control.test.ts` has
 *  the same walk for the same reason: a list of files goes stale, a walk does not. */
function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

