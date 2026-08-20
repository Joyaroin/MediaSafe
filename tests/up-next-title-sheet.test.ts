import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Opening a title from the phone's Up next tab opens it **on Up next**.
 *
 * A group tile used to be a `Link` to `/library/{entryId}` — a Library surface, under the
 * Library's path, carrying a `‹ Library` bar back to a grid the reader never asked for.
 * Tapping a show on Up next put them in the Library and left them there. The sheet
 * replaces that: the note rises over the tab, and dismissing it returns the reader to the
 * scroll position they left.
 *
 * Four things about that would fail **silently** rather than on sight, which is the line
 * `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **The tile stops navigating.** A later diff restoring the `Link` puts the reader
 *     back in the Library, and every test still passes, and the sheet still exists — it
 *     just never opens. This is the whole reason the file exists and nothing else guards
 *     it.
 *  2. **The tile outside a sheet still navigates.** The same component renders on the
 *     group screens at `/up-next/{group}`, which have no provider. Making the tile
 *     unconditionally a button would leave those screens with tiles that do nothing at
 *     all — a dead surface that throws no error.
 *  3. **The opened tile drops its transition name.** `DESIGN.md` §8: a name can only mark
 *     one on-screen element at a time. Unlike the route, which replaced the page and took
 *     the tile with it, the sheet sits *over* a still-mounted tile. Keep the name on both
 *     and the browser finds `group-poster-{id}` twice and skips the morph — no error, no
 *     warning, the animation simply stops happening.
 *  4. **The motion comes from the vocabulary.** `app/motion.ts` exists so that a duration
 *     typed at a call site is as visible a mistake as a `text-[1.37rem]`. The sheet is the
 *     first caller of `sheet`, and a later edit hand-rolling a number here would be the
 *     first crack in that.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * The same reason `tests/phone-groups-scroll.test.ts` does, and it is not a preference:
 * `GroupTile` and the sheet both import React's `ViewTransition` (#141), which the
 * installed React 19.2.8 does not export — Next supplies it at build time, so these
 * components render in the app and are `undefined` under `renderToStaticMarkup` here.
 * Nothing on this surface can be rendered in this harness at all. Reading the source is
 * what is left.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const GROUP_TILE = "app/(signed-in)/up-next/group-tile.tsx";
const TITLE_SHEET = "app/(signed-in)/up-next/title-sheet.tsx";
const SHEET_CONTEXT = "app/(signed-in)/up-next/title-sheet-context.ts";
const UP_NEXT_GROUPS = "app/(signed-in)/up-next/up-next-groups.tsx";

describe("a tile on the Up next tab opens the sheet rather than the Library", () => {
  const tile = sourceAt(GROUP_TILE);

  it("opens the sheet when one is present", () => {
    expect(tile).toMatch(/sheet\.open\(entry\)/);
  });

  it("renders a button, not a link, when a sheet is present", () => {
    // The button branch is the one guarded by a sheet *being* there.
    expect(tile).toMatch(/sheet === null \?/);
    expect(tile).toMatch(/<button/);
  });

  it("still links to the title-detail route when there is no sheet", () => {
    // The group screens have no provider and must keep working.
    expect(tile).toMatch(/href=\{`\/library\/\$\{entry\.libraryEntryId\}`\}/);
  });

  it("reads the sheet as optional rather than throwing without one", () => {
    // `useLibrarySelection` throws outside its provider; this one must not, or every
    // group screen becomes a runtime error.
    expect(sourceAt(SHEET_CONTEXT)).toMatch(
      /export function useTitleSheet\(\): TitleSheet \| null/,
    );
  });
});

describe("a tile does not drag the database in behind it", () => {
  it("takes the context from its own module, not from the provider", () => {
    // `up-next/{group}/loading.tsx` imports `GroupHeading` from `group-screen.tsx`,
    // which imports `GroupTile`. Point the tile at `title-sheet.tsx` and that skeleton
    // transitively imports the server action, `db/access.ts` and `server-only` with it —
    // which is exactly how `tests/loading-boundaries.test.ts` broke while this was built.
    const tile = sourceAt(GROUP_TILE);
    expect(tile).toMatch(/from "\.\/title-sheet-context"/);
    expect(tile).not.toMatch(/from "\.\/title-sheet"/);
  });

  it("keeps every server import on the provider's side of the split", () => {
    const context = sourceAt(SHEET_CONTEXT);
    expect(context).not.toMatch(/title-detail-actions/);
    expect(context).not.toMatch(/@\/db\/access/);
  });
});

describe("the five groups are wrapped in the sheet", () => {
  const groups = sourceAt(UP_NEXT_GROUPS);

  it("provides one sheet around all five groups", () => {
    expect(groups).toMatch(/<TitleSheetProvider>/);
    // One provider, not one per group — opening a second title replaces what is in the
    // sheet rather than stacking a second sheet over the first.
    expect(groups.match(/<TitleSheetProvider>/g)).toHaveLength(1);
  });
});

describe("the poster morph is not silently disabled", () => {
  const tile = sourceAt(GROUP_TILE);

  it("drops the tile's transition name while the sheet holds that entry", () => {
    expect(tile).toMatch(/heldBySheet/);
    // The name is applied only on the branch where the sheet is *not* holding it.
    expect(tile).toMatch(/heldBySheet \?/);
  });

  it("still names the poster when the sheet is not holding it", () => {
    expect(tile).toMatch(/groupPosterTransitionName\(entry\.libraryEntryId\)/);
  });

  it("gives the sheet somewhere to morph to before the read lands", () => {
    // The loading frame carries the same name, so the morph has a destination the
    // instant it starts rather than one that appears when the detail arrives.
    const sheet = sourceAt(TITLE_SHEET);
    expect(sheet).toMatch(/function SheetLoading/);
    expect(sheet).toMatch(/groupPosterTransitionName\(entry\.libraryEntryId\)/);
  });
});

describe("the sheet takes its motion from the vocabulary", () => {
  const sheet = sourceAt(TITLE_SHEET);

  it("imports the shared transitions rather than naming its own", () => {
    expect(sheet).toMatch(/import \{ exit, sheet \} from "@\/app\/motion"/);
  });

  it("types no duration at the call site", () => {
    // `app/motion.ts` is the one place a duration is chosen. A bare `duration:` here
    // would be the first hand-rolled number on this surface.
    expect(sheet).not.toMatch(/duration:\s*[\d.]/);
  });

  it("springs on arrival and does not spring on departure", () => {
    expect(sheet).toMatch(/out: \{ y: "100%", transition: exit \}/);
    expect(sheet).toMatch(/in: \{ y: 0, transition: sheet \}/);
  });
});

describe("the sheet is a phone surface and does not navigate", () => {
  const sheet = sourceAt(TITLE_SHEET);

  it("never renders on the desktop, which has the pane instead", () => {
    expect(sheet).toMatch(/lg:hidden/);
  });

  it("carries no link or push back into the Library", () => {
    // The point of the whole change. A `‹ Library` bar reintroduced here would put the
    // reader back where this took them out of.
    expect(sheet).not.toMatch(/next\/link/);
    expect(sheet).not.toMatch(/router\.push/);
  });

  it("can be dismissed by more than one control", () => {
    expect(sheet).toMatch(/"Escape"/);
    expect(sheet).toMatch(/aria-label="Close"/);
  });

  it("locks the surface underneath while it is open", () => {
    expect(sheet).toMatch(/document\.body\.style\.overflow/);
  });

  it("hands focus back to the tile that opened it", () => {
    expect(sheet).toMatch(/opener\.current\?\.focus\(\)/);
  });
});
