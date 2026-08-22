import { readFileSync } from "node:fs";
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

describe("an Up next tile hands its group's abandoned state to the selection", () => {
  const source = sourceAt("app/(signed-in)/up-next/group-tile.tsx");

  it("puts abandoned in the SelectableTitle it builds", () => {
    expect(source).toMatch(/const title: SelectableTitle = \{[^}]*\babandoned,/);
  });
});

describe("the group screens say which group they are", () => {
  it("the Abandoned screen tells GroupScreen that it is the abandoned one", () => {
    const source = sourceAt("app/(signed-in)/up-next/abandoned/page.tsx");
    expect(source).toMatch(/<GroupScreen[^>]*\babandoned\b[^>]*\/>/);
  });

  it("GroupScreen forwards it to every tile", () => {
    const source = sourceAt("app/(signed-in)/up-next/group-screen.tsx");
    expect(source).toMatch(/<GroupTile\b[^>]*abandoned=\{abandoned\}/);
  });

  it("the four screens that are not the abandoned pile say nothing, and so are not it", () => {
    // The prop defaults to `false`, so silence is the correct answer on these four — and
    // asserting the silence is what stops a copy-paste from marking a watching group
    // abandoned, which would make bulk Abandon skip every title on it.
    for (const group of ["coming-back", "old-friends", "ongoing", "watchlist"]) {
      const source = sourceAt(`app/(signed-in)/up-next/${group}/page.tsx`);
      expect(source).not.toMatch(/<GroupScreen[^>]*\babandoned\b/);
    }
  });
});

describe("the home page's Abandoned group still says which group it is", () => {
  it("passes abandoned to the fifth group and to no other", () => {
    const source = sourceAt("app/(signed-in)/up-next/up-next-groups.tsx");
    // The one bare `abandoned` prop, on the one `HomeGroup` whose href is the abandoned
    // pile. #198 relied on it for the dim; #199 now relies on it for the write as well.
    expect(source).toMatch(/href="\/up-next\/abandoned"[^>]*\babandoned\b[^>]*\/>/);
  });
});
