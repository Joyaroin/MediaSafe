import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RemoveControl } from "@/app/(signed-in)/library/remove-control";
import { GHOST_RECOVERY, SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * Where *Remove from library* is, and where it is not — issue #142.
 *
 * `tests/remove-from-library.test.ts` holds what the write does to the database. This file
 * holds the three things about the surface that would fail **silently** rather than on
 * sight, which is the line drawn around what earns a test:
 *
 *  1. **It is on title detail and nowhere else.** A tile, a rail, a grid cell or a swipe
 *     gaining this control is the ticket's own named failure — an irreversible action under
 *     a gesture made while scrolling — and it is a fact about the repository rather than
 *     about any render, so it is checked as one. `tests/unowned-title-surface.test.ts`
 *     walks the import graph the same way, for the same kind of claim.
 *  2. **Giving up and removing carry different copy.** They were adjacent controls when
 *     this was written, and the whole ticket exists to stop somebody destroying years of
 *     watches meaning to tidy up. The abandon control is retired, but the sentence it owned
 *     is not: the library tile still tells a reader that *watching it again clears this*,
 *     and a refactor that made the remove block echo that reassurance would look completely
 *     ordinary in a diff.
 *  3. **A failed count offers no confirmation.** The route's boundary must have no form in
 *     it at all, rather than a form that is conditionally hidden.
 *
 * `RemoveControl` imports `next/link` and nothing else — no action, no `server-only` — which
 * is what makes it renderable here at all. `tests/programme-note.test.ts` explains that
 * boundary.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const render = () =>
  renderToStaticMarkup(
    createElement(RemoveControl, { libraryEntryId: "entry-1", titleName: "The Bear" }),
  );

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("the remove control", () => {
  it("leads to the confirmation for this entry, and writes nothing itself", () => {
    const markup = render();

    expect(markup).toContain('href="/titles/entry-1/remove"');
    // A link, not a form or a button: nothing is destroyed from the page the control is on.
    expect(markup).not.toMatch(/<button|<form/);
  });

  it("names the title it would remove, for anybody listening rather than looking", () => {
    expect(render()).toContain('aria-label="Remove The Bear from your library"');
  });

  it("takes the accent now, knowingly, and only as GHOST_RECOVERY's outline", () => {
    // Until issue #195 this control never took the reserved accent (`app/globals.css`,
    // issue #134) — the abandon control was named as the thing that must never take it,
    // and this was quieter still. #195 overrode both, in the open (the
    // Buttons register records it), because a control nobody can tell apart from
    // prose is a control nobody presses.
    //
    // What still must not happen is the *solid* fill `SOLID_RECOVERY` reserves for a
    // surface's one primary action — this is `GHOST_RECOVERY`, an outline until pressed,
    // never a filled accent ground sitting on the page from the moment it loads. Matched
    // against the constants themselves rather than reconstructed patterns, so a change to
    // either treatment's own definition is what this test tracks.
    const markup = render();

    expect(markup).toContain(GHOST_RECOVERY);
    expect(markup).not.toContain(SOLID_RECOVERY);
  });
});

describe("giving up and removing, which must not read as the same thing", () => {
  /**
   * The comparison outlived the control it was written against.
   *
   * It read the reassurance out of `abandon-control.tsx`, which is deleted — nothing sets
   * a title *abandoned* by hand any more. The **state** is not deleted, and neither is the
   * promise attached to it: the library tile still says *Watching it again clears this* for
   * a title already in it, which is now the only statement anywhere of the only way out. So
   * the contrast is read from the tile instead, and it is the same contrast — a recoverable
   * thing and an unrecoverable one, in the same voice, saying opposite things.
   *
   * The shape half of the old pair — *one is a row, the other is a block* — went with the
   * control. Two constructs cannot be told apart when only one of them exists, and there is
   * no surviving surface the contrast could honestly be repointed at.
   */
  it("promises the opposite of what the library tile promises", () => {
    const markup = render();
    /* The sentence moved. It was on the library cell, which is a poster column now with
       room for the state word and nothing else; it is on the title's own hero — the page a
       reader opens to do something about it, and the page carrying the control that clears
       it. Read from whichever surface renders it rather than restated here, so that
       rewording the sentence fails this and asks the question. */
    const tile = sourceAt("app/(signed-in)/library/title-hero.tsx");

    expect(tile).toContain("Watching it again clears this");

    // The remove block's counterweight, in the same voice and to the opposite effect.
    expect(markup).toContain("Nothing brings them back");
    expect(markup).not.toContain("Watching it again clears");
    // No in-app recovery is implied anywhere in it — the caveat is that watches
    // this application recorded are restorable by no means at all.
    expect(markup).not.toMatch(/undo|restore|recover|trash|grace period/i);
  });
});

describe("where the remove control appears", () => {
  it("is imported by title detail's content and by nothing else", () => {
    const importers = sourceFiles(path.join(REPOSITORY_ROOT, "app"))
      .filter((file) => /from "[^"]*remove-control"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(REPOSITORY_ROOT, file));

    // Not a tile, not a rail, not a grid cell, not a swipe — the ticket's first acceptance
    // criterion, checked rather than remembered.
    expect(importers).toEqual(["app/(signed-in)/library/programme-note-content.tsx"]);
  });

  it("puts no removal on the tile, the grid, or the up next surface", () => {
    // The desktop TONIGHT row (`up-next-grid.tsx`, `up-next-row.tsx`) named here until
    // issue #136 deleted it, and the phone home's dominant card
    // (`up-next-dominant-card.tsx`) until issue #138 deleted that too. #250 then deleted
    // the phone's five groups; Up next's browsing surfaces are now the desktop rail's tile
    // and the phone's two rails, so those are what this checks — the list follows the
    // surfaces that exist, which is the whole point of reading them off disk rather than
    // remembering them.
    const browsing = [
      "app/(signed-in)/library/library-entry-cell.tsx",
      "app/(signed-in)/library/library-grid.tsx",
      "app/(signed-in)/library/selectable-entry.tsx",
      "app/(signed-in)/up-next/up-next-episode-row.tsx",
      "app/(signed-in)/up-next/up-next-episode-card.tsx",
      "app/(signed-in)/up-next/up-next-film-rail.tsx",
    ];

    for (const file of browsing) {
      expect({ file, mentions: /\bremove\b/i.test(sourceAt(file)) }).toEqual({
        file,
        mentions: false,
      });
    }
  });

  it("is reachable from one route, and that route is the confirmation", () => {
    const routes = sourceFiles(path.join(REPOSITORY_ROOT, "app"))
      .filter((file) => /\/remove\//.test(file))
      .map((file) => path.relative(REPOSITORY_ROOT, file))
      .sort();

    expect(routes).toEqual([
      "app/(signed-in)/titles/[entryId]/remove/actions.ts",
      "app/(signed-in)/titles/[entryId]/remove/error.tsx",
      // Issue #180's pending boundary. It belongs on this list for the reason the list
      // exists — it is a render of this route, and the thing worth knowing about it is the
      // same thing worth knowing about `error.tsx`: there is no form on it. That half is
      // asserted in `tests/library-pending.test.ts`, beside the other two states.
      "app/(signed-in)/titles/[entryId]/remove/loading.tsx",
      "app/(signed-in)/titles/[entryId]/remove/page.tsx",
      "app/(signed-in)/titles/[entryId]/remove/remove-frame.tsx",
      "app/(signed-in)/titles/[entryId]/remove/remove-title-form.tsx",
    ]);
  });
});

describe("a count that could not be read", () => {
  it("has a boundary of its own, so the failure does not replace the whole page", () => {
    // Its existence is the assertion: without it a failed count reaches the library's
    // boundary or the root's, and the reader is told something failed without being told it
    // was the thing they came here to read.
    expect(sourceAt("app/(signed-in)/titles/[entryId]/remove/error.tsx")).toContain(
      "ReadFailure",
    );
  });

  it("offers no confirmation under it — the form is not in that render at all", () => {
    const boundary = sourceAt("app/(signed-in)/titles/[entryId]/remove/error.tsx");

    expect(boundary).not.toContain("RemoveTitleForm");
    expect(boundary).not.toContain("removeTitleAction");
  });

  it("never turns a failed count into a zero", () => {
    // `titleFootprint` throws, and the page calls it without a `try`. Both halves are the
    // rule; the second is the one a well-meaning edit would break.
    const page = sourceAt("app/(signed-in)/titles/[entryId]/remove/page.tsx");

    expect(page).toContain("await titleFootprint(");
    expect(page).not.toMatch(/\btry\s*\{/);
    expect(page).not.toMatch(/\bcatch\b/);
  });
});
