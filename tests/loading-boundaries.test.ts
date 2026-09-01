import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyLists } from "@/app/(signed-in)/lists/empty-lists";
import ListsLoading from "@/app/(signed-in)/lists/loading";
import ListDetailLoading from "@/app/(signed-in)/lists/[listId]/loading";
import DeleteAccountLoading from "@/app/(signed-in)/settings/delete-account/loading";
import SettingsLoading from "@/app/(signed-in)/settings/loading";
import UnownedTitleLoading from "@/app/(signed-in)/catalogue/[kind]/[tmdbId]/loading";

/**
 * The surfaces [#181](https://github.com/Joyaroin/MediaSafe/issues/181) converts — eleven
 * when it was written, six since [#250](https://github.com/Joyaroin/MediaSafe/issues/250)
 * deleted the phone's five group screens along with the groups that linked to them.
 *
 * `tests/library-pending.test.ts` already owns `PendingLine` itself and the argument for
 * why pending must not read as empty or failed; this file does not repeat that case by
 * case. What is asserted here is what is specific to each of them — the right
 * heading renders immediately, the right boundary owns each segment rather than an
 * ancestor's speaking for it, and every surface that could offer a destructive action
 * offers none while its read is still pending.
 */

const markupOf = (element: React.ReactElement) => renderToStaticMarkup(element);

describe("Lists and its detail route", () => {
  it("paints Lists' own heading, not the empty state", () => {
    const pending = markupOf(createElement(ListsLoading));
    const empty = markupOf(createElement(EmptyLists));

    expect(pending).toContain("Lists");
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("Group it your own way");
    expect(pending).not.toEqual(empty);
  });

  /**
   * `lists/[listId]`'s `<h1>` is `{detail.name}`, read from the database — DESIGN.md §9's
   * back-link shape, the same one `titles/[entryId]/loading.tsx` follows. The list's own
   * page is never reached by `lists/loading.tsx`'s boundary, which would print *Lists* over
   * one list's own contents.
   */
  it("says which page is reading rather than inheriting Lists' own heading", () => {
    const pending = markupOf(createElement(ListDetailLoading));

    expect(pending).toContain("‹ Lists");
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("<h1");
  });
});

describe("Settings and delete-account", () => {
  it("paints Settings' own literal heading while the three sections are pending", () => {
    const pending = markupOf(createElement(SettingsLoading));

    expect(pending).toContain("Settings");
    expect(pending).toContain('role="status"');
  });

  /**
   * The acceptance criterion in its literal form, for the one screen in the application
   * where offering the wrong control by accident is irreversible: a page that has not yet
   * counted an account's rows must have no form and no delete button on it, the same
   * guarantee `remove/loading.tsx` gives the library's own destructive page.
   */
  it("offers no way to destroy the account while its counts are still being read", () => {
    const pending = markupOf(createElement(DeleteAccountLoading));

    expect(pending).toContain("Delete account");
    expect(pending).toContain("‹ Back to Settings");
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("<form");
    expect(pending).not.toContain("<button");
  });
});

describe("An unowned title's detail", () => {
  /** Back-link shape again: the name is exactly what is being waited for. */
  it("says which list this title was reached from, and prints no name early", () => {
    const pending = markupOf(createElement(UnownedTitleLoading));

    expect(pending).toContain("‹ Lists");
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("<h1");
    // No poster either — unlike the desktop pane's `loading` frame, a cold route render
    // has no `selectedPosterPath` in hand to mount one from.
    expect(pending).not.toContain("<img");
  });
});

/**
 * **The five phone group screens are gone, and their cases went with them** — #250 deleted
 * `/up-next/{ongoing,coming-back,old-friends,watchlist,abandoned}` along with the five
 * vertical groups that were the only links into them. The property they held — *a route
 * below a converted one paints its own label rather than inheriting the ancestor's* — is
 * still held here by `lists/[listId]` and by `titles/[entryId]/remove`, which are the routes
 * that still have an ancestor to inherit from — the title's own route stopped being one of
 * them when #290 moved it out from under `/library`, and its remove child took its place.
 * `tests/route-manifest.test.ts` is what proves the five are really gone rather than merely
 * unlinked.
 */

/**
 * `up-next/loading.tsx` cannot be rendered here the way the rest of this file's
 * `loading.tsx` files are: it imports `ProgrammeNoteLayout`, which imports the programme
 * note pane, which imports the same server-action chain `db/access.ts` guards with the
 * `server-only` package — a guard that throws on any import outside Next's own RSC
 * bundler, `renderToStaticMarkup` included. No existing test in this repository renders
 * that pane directly (`tests/programme-note.test.ts` renders one of its child pieces
 * instead), so this checks the same property the source tree, the way
 * `tests/library-pending.test.ts`'s *the navigation stays up* section checks a property by
 * reading the tree rather than rendering.
 */
describe("Up next — a region boundary, not a whole surface", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app", "(signed-in)", "up-next", "loading.tsx"),
    "utf8",
  );

  /**
   * The whole reason this boundary is a region rather than a whole surface: wrapping the
   * pending rails in the same `ProgrammeNoteLayout` `page.tsx` uses is what keeps the
   * pane's column on screen throughout, rendering in its own already-settled `idle` phase,
   * rather than the pane popping in only once the rails resolve.
   */
  it("wraps the pending rails in the same two-pane layout the loaded page uses", () => {
    expect(source).toContain("ProgrammeNoteLayout");
  });

  it("paints the Tonight heading and one pending line, not a second boundary", () => {
    expect(source).toContain("UpNextHeading");
    expect(source).toContain("PendingLine");
  });
});
