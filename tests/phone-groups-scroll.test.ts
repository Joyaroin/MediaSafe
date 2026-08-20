import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone home's groups scroll — issue #171.
 *
 * #138 built these five groups as a static three-up grid, from
 * `design/catalogue-wall.html`'s `.prow`. #171 turns each into a horizontally scrolling,
 * snapping track. Three things about that would fail **silently** rather than on sight,
 * which is the line `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **The whole group renders.** The `slice(0, 3)` this replaces was invisible in a diff
 *     and invisible on screen — a group that quietly stopped at three would look exactly
 *     like a group with three members, and the scroll would simply end early. That is the
 *     *showing 10 of 62* line with the number filed off (§9).
 *  2. **The track snaps.** `snap-x snap-mandatory` on the track and `snap-start` on the
 *     tile are two halves of one rule — *a scroll comes to rest on a whole poster* — and
 *     either one alone silently does nothing. So is `scroll-pl-4` against the track's own
 *     `px-4`: drop it and every group's first poster parks under the page gutter.
 *  3. **No recording control, still.** #138's stated reversal is the thing most likely to
 *     be "helpfully" undone by a later diff now that this surface is a rail like the
 *     desktop's, and the desktop's rails sit beside a pane full of controls.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * `GroupTile` imports React's `ViewTransition` (#141), which the installed React 19.2.8
 * does not export — Next supplies it at build time, so the component renders in the app
 * and is `undefined` under `renderToStaticMarkup` here. `tests/poster.test.ts` can render
 * `Poster` because `Poster` has no transition of its own; anything above it on this
 * surface cannot be rendered in this harness at all. Reading the source is what is left,
 * and it is the same device `tests/remove-from-library-control.test.ts` uses for facts
 * about a surface rather than about a render.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const HOME_GROUP = "app/(signed-in)/up-next/home-group.tsx";

describe("the phone home's group renders the whole group", () => {
  const source = sourceAt(HOME_GROUP);

  it("maps every entry rather than a slice of them", () => {
    expect(source).toMatch(/entries\.map\(/);
    expect(source).not.toMatch(/\.slice\(/);
  });

  it("keeps no tile-count constant to reintroduce a cap with", () => {
    // `HOME_GROUP_TILE_COUNT = 3` was the cap. A named constant is the easiest thing to
    // quietly set back to a number.
    expect(source).not.toMatch(/TILE_COUNT/);
  });
});

describe("the track scrolls and snaps", () => {
  const source = sourceAt(HOME_GROUP);

  it("is a horizontal track, not a grid", () => {
    expect(source).toMatch(/overflow-x-auto/);
    expect(source).toMatch(/\bflex\b/);

    // The grid this replaces. A group that is both is a group that is neither.
    expect(source).not.toMatch(/grid-cols-3/);
  });

  it("snaps from both halves of the rule", () => {
    expect(source).toMatch(/snap-x/);
    expect(source).toMatch(/snap-mandatory/);
    // The tile's half, passed down to `GroupTile`'s `<li>`.
    expect(source).toMatch(/snap-start/);
  });

  it("aligns the snap to the page gutter rather than the padding box", () => {
    // Asserted against the `<ol>`'s own class list rather than the whole file. Both
    // classes are named in this component's prose too, so a file-wide `toMatch` passed
    // on the docblock alone — it stayed green through the linen redesign moving the
    // gutter from `16px` to `22px`, which is exactly the change it existed to catch.
    const track = source.match(/<ol className="([^"]*)"/)?.[1];
    expect(track).toBeDefined();
    expect(track).toContain("scroll-pl-[22px]");
    expect(track).toContain("px-[22px]");
  });

  it("fixes the tile's width, because a track has no cells to derive one from", () => {
    // `116px` since the linen redesign — the wider gutter and gap need a wider tile to
    // leave the same partial third poster showing at the fold (`home-group.tsx`).
    expect(source).toMatch(/w-\[116px\]/);
    // Without this, flex compresses a long group's tiles instead of overflowing.
    expect(source).toMatch(/shrink-0/);
  });

  it("hides the scrollbar the same way the desktop rail does", () => {
    expect(source).toMatch(/scrollbar-width/);
    expect(source).toMatch(/webkit-scrollbar/);
  });

  it("grows no arrows — a phone has touch, and an arrow would be decoration", () => {
    // The desktop rail's arrows exist because a mouse without a horizontal wheel cannot
    // reach the track at all (`up-next-rail.tsx`). That reason has no phone equivalent.
    expect(source).not.toMatch(/scrollBy/);
    expect(source).not.toMatch(/aria-label="Scroll/);
    // `‹` is the back arrow's glyph; `›` is excluded because `more ›` carries one.
    expect(source).not.toContain("‹");
  });

  it("stays a server component — nothing here needs state", () => {
    // The desktop rail is a client component because it measures its own scroll for the
    // arrows. With no arrows there is nothing to measure and nothing to hydrate.
    expect(source).not.toMatch(/"use client"/);
  });
});

describe("what #138 and #144 keep", () => {
  it("leaves `more ›` unconditional", () => {
    const source = sourceAt(HOME_GROUP);

    expect(source).toContain("more ›");
    // The only length test in the *code* is the empty-group guard — the docblock discusses
    // it too, hence stripping comments first. A second test would be `more ›` hidden once a
    // group fits, which is a count in disguise.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

    expect(code.match(/entries\.length/g) ?? []).toHaveLength(1);
    expect(code).toMatch(/entries\.length === 0/);
  });

  it("puts no recording control on the phone home", () => {
    for (const file of [
      HOME_GROUP,
      "app/(signed-in)/up-next/group-tile.tsx",
      "app/(signed-in)/up-next/up-next-groups.tsx",
    ]) {
      // The control itself, not the word — every one of these files discusses marking in
      // prose, and #138's whole point is that the discussion is where it stays.
      const control = /MarkWatchedButton|useWatchMark|watch-action|markWatched|WatchSweep/;

      expect({ file, marks: control.test(sourceAt(file)) }).toEqual({
        file,
        marks: false,
      });
    }
  });

  it("leaves the group screen's vertical grid alone", () => {
    // The `more ›` destination is a grid on purpose — a better shape for scanning a large
    // group than one horizontal run — and #171 does not touch it.
    const screen = sourceAt("app/(signed-in)/up-next/group-screen.tsx");

    expect(screen).toMatch(/grid-cols-3/);
    expect(screen).not.toMatch(/snap-mandatory/);
  });

  it("leaves the desktop rail alone", () => {
    // #171 is a phone change. The desktop's own track keeps its `6` gutter and its arrows.
    const rail = sourceAt("app/(signed-in)/up-next/up-next-rail.tsx");

    expect(rail).toMatch(/scroll-pl-6/);
    expect(rail).toMatch(/scrollBy/);
  });
});
