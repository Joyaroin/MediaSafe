import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ListDetailLoading from "@/app/(signed-in)/lists/[listId]/loading";
import DeleteAccountLoading from "@/app/(signed-in)/settings/delete-account/loading";
import SettingsLoading from "@/app/(signed-in)/settings/loading";
import UnownedTitleLoading from "@/app/(signed-in)/catalogue/[kind]/[tmdbId]/loading";
import SearchLoading from "@/app/(signed-in)/search/loading";
import ComingUpLoading from "@/app/(signed-in)/coming-up/loading";

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

describe("a list's own route", () => {
  // `/lists` itself is a redirect to Library's Lists tab since the UI overhaul, so it has
  // no pending boundary of its own to assert.

  /**
   * `lists/[listId]`'s `<h1>` is `{detail.name}`, read from the database — the
   * back-link shape, the same one `titles/[entryId]/loading.tsx` follows. The list's own
   * page has its own boundary rather than one printing *Lists* over one list's contents.
   */
  it("says which page is reading rather than inheriting Lists' own heading", () => {
    const pending = markupOf(createElement(ListDetailLoading));

    // The round back button since Charcoal (#402): an arrow, named for a screen reader.
    expect(pending).toContain('aria-label="Back to Lists"');
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
  it("offers the way back, and prints no name early", () => {
    const pending = markupOf(createElement(UnownedTitleLoading));

    // The same back bar the loaded page draws — back to wherever the reader came from
    // (issue #357), which a cold render with no history names as Tonight.
    expect(pending).toContain("‹ Tonight");
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain("<h1");
    // No poster either — unlike the desktop pane's `loading` frame, a cold route render
    // has no `selectedPosterPath` in hand to mount one from.
    expect(pending).not.toContain("<img");
  });
});

/**
 * Search — issue #302. Until now it was the one tab route with neither a pending nor a
 * failure boundary: its rails streamed behind a fallback of `null`, so a slow connection
 * saw nothing move for 243ms and then a hard cut. `search-heading.tsx` is the same
 * three-caller shape `library-heading.tsx` and `you-heading.tsx` already use, so a reader
 * waiting on search is never shown a different tab's heading — the property this test
 * exists to pin down.
 */
describe("Search", () => {
  it("names Search and carries a status role while its own boundary is pending", () => {
    const pending = markupOf(createElement(SearchLoading));

    expect(pending).toContain("Search");
    expect(pending).toContain('role="status"');
    // Never another surface's heading — the failure this boundary exists to rule out.
    expect(pending).not.toContain(">Library<");
    expect(pending).not.toContain(">You<");
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

  it("paints the Up next heading and the card grid it becomes, in one live region", () => {
    expect(source).toContain("UpNextHeading");
    expect(source).toContain("<SkeletonRegion");
    expect(source.match(/<SkeletonRegion/g)).toHaveLength(1);
    expect(source).toContain("CARD_GRID");
  });

  /** The pager's two labels went with it (issue #399); a skeleton of them would promise a
   *  control the page no longer draws. */
  it("draws no pager labels", () => {
    expect(source).not.toContain("gap-[26px]");
  });
});

/**
 * Coming up — a route of its own since issue #399, where it was the pager's second page
 * and waited behind Up next's boundary. Rendered, because unlike Up next's it imports
 * nothing behind `server-only`.
 */
describe("Coming up — its own heading, and rows in the shape they become", () => {
  const markup = markupOf(createElement(ComingUpLoading));

  it("paints Coming up's own heading in one live region", () => {
    expect(markup).toContain(">Coming up</h1>");
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    // Never another surface's heading — the failure this boundary exists to rule out.
    expect(markup).not.toContain(">Tonight<");
  });
});
