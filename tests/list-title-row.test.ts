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
 * this file locks that path down: unlinked when `libraryEntryId` is `null`, linked to this
 * account's own entry when it is not.
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
    ...overrides,
  };
}

const render = (row: ListDetailTitleRow) =>
  renderToStaticMarkup(createElement("ul", null, createElement(ListTitleRow, { title: row })));

describe("a list row for a title this account does not own", () => {
  it("renders untracked — the borrowed facts, and nothing to press", () => {
    const markup = render(titleRow({ libraryEntryId: null, name: "Somebody Else's Pick" }));

    expect(markup).not.toMatch(/<a[ >]/);
    expect(markup).toContain("Somebody Else&#x27;s Pick");
  });
});

describe("a list row for a title this account owns", () => {
  it("links to this account's own entry, including one it re-added after removing", () => {
    const markup = render(titleRow({ libraryEntryId: "entry-42" }));

    expect(markup).toContain('href="/library/entry-42"');
  });
});
