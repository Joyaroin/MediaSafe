import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ListTitleRow } from "@/app/(signed-in)/lists/[listId]/list-title-row";
import type { ListDetailTitleRow } from "@/db/access";

/**
 * The row's own rendering — issue #151's *the row renders as untracked afterwards*.
 *
 * `getListDetail`'s `libraryEntryId` is `null` for exactly one reason from this component's
 * point of view: this account does not currently own the title, whether that is because it
 * was never added or because it was removed a moment ago (`db/access.ts`'s
 * `removeTitleFromLibrary` docblock — a list holds a title, not a library entry, so a
 * removal cannot leave a third state behind). There is nothing in `ListDetailTitleRow` that
 * distinguishes those two histories, so one render path has to be correct for both, and
 * this file locks that path down.
 *
 * ── What issue #148 changed under it ──────────────────────────────────────────────────
 *
 * Untracked used to mean **unlinked**, and this file asserted that. It was the right
 * assertion for a world with no page for a title nobody owns: #151 shipped days before
 * #148, and `list-title-row.tsx`'s own docblock named the `libraryEntryId === null` branch
 * as the one line that would change when it did.
 *
 * It has. Untracked now means **linked to `catalogue/[kind]/[tmdbId]`** — the same borrowed
 * facts with no owned fact on them and one *Add to library*. Every row is a link; which
 * page it links to is the ownership question, and that is what this file locks down now.
 * The property #151 actually cares about is untouched: a row for a title this account does
 * not own must never carry that account's entry id, and a removed title's row is
 * indistinguishable from a never-added one.
 */

function titleRow(overrides: Partial<ListDetailTitleRow> = {}): ListDetailTitleRow {
  return {
    titleId: "11111111-1111-1111-1111-111111111111",
    libraryEntryId: null,
    kind: "show",
    tmdbId: 1,
    name: "Comfort Show",
    releaseYear: 2020,
    posterPath: null,
    position: 1,
    // `null` by default — no bar — the way an unowned title arrives, which is what most
    // of this file is about. A case that wants one overrides it.
    progress: null,
    ...overrides,
  };
}

// `dragHandle` is issue #149's addition — a real node in the product, `null` here since
// this file is about the link each row renders, not the handle beside it.
const render = (row: ListDetailTitleRow) =>
  renderToStaticMarkup(
    createElement("ul", null, createElement(ListTitleRow, { title: row, dragHandle: null })),
  );

describe("a list row for a title this account does not own", () => {
  it("renders the borrowed facts, and links to the title's own unowned page", () => {
    const markup = render(
      titleRow({ libraryEntryId: null, kind: "film", tmdbId: 27205, name: "Somebody Else's Pick" }),
    );

    // Keyed by `(kind, tmdbId)`, because that is what a page with no owner can be keyed
    // by — `db/access.ts`'s `getUnownedTitleDetail` carries why.
    expect(markup).toContain('href="/catalogue/film/27205"');
    expect(markup).toContain("Somebody Else&#x27;s Pick");
  });

  it("never carries a library entry id, whoever else owns the title", () => {
    // Issue #151's property, and the one that survives #148 unchanged: a removed title's
    // row and a never-added title's row are the same row, and neither points at an entry.
    const markup = render(titleRow({ libraryEntryId: null }));

    expect(markup).not.toContain("/titles/");
  });
});

describe("a list row for a title this account owns", () => {
  it("links to this account's own entry, including one it re-added after removing", () => {
    const markup = render(titleRow({ libraryEntryId: "entry-42" }));

    expect(markup).toContain('href="/titles/entry-42"');
  });
});
