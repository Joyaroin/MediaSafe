import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #203, *The episode row grows when a mark settles*.
 *
 * Issue #195 moved *Rewatch* and *Unwatch* onto `GHOST_RECOVERY` and did not re-measure
 * the fixed trailing slot they sit in. At `px-4 py-2` they did not fit it: `177.9px` of a
 * `160px` slot, `215.9px` once #196's *watched up to here* was on the row too, and
 * `50.2px` tall against every other state's `44px` — so a settled watched row grew the
 * moment a mark landed and took every row under it with it, and the overflow spilled
 * leftward over the episode name. That is the property `DESIGN.md` §6 exists to hold and
 * `episode-line.ts` records being measured into existence twice.
 *
 * ── Why this is arithmetic over the class strings and not a rendered row ─────────────
 *
 * Two reasons, and the first is the same one `tests/underline-audit.test.ts` gives:
 * `programme-note-episodes.tsx` is downstream of React's `ViewTransition` (#141), which
 * the installed React does not export outside a Next build. `phone-groups-scroll.test.ts`
 * and `remove-from-library-control.test.ts` hit the same wall.
 *
 * The second matters more. Even if the row rendered here it would render into jsdom, which
 * has no layout: every `getBoundingClientRect` comes back zero, so a rendered row would
 * assert nothing at all about width or height. The numbers in this file were taken the way
 * every other measurement in this codebase was — `getBoundingClientRect` in a real Chromium
 * tab against the compiled CSS with Archivo loaded — and what the test does is hold the
 * **source** to them: it reads the class strings the row actually ships, converts their
 * Tailwind measures to pixels, and adds up each state the slot can be in.
 *
 * So this catches the thing #195 did. Change a padding step, a gap, the slot's width, or
 * the labels, and the sums move and this fails with the number. It cannot catch a change
 * to the type ramp or the typeface, which move the glyph widths below — `GLYPH` is this
 * file's impure edge and its provenance is recorded on it.
 *
 * ── Issue #217 retired one label and added a fixed square in its place ───────────────
 *
 * *Strike it* became a checkmark: `RECORDING_HIT_BOX` (`watch-mark-motion.tsx`) is a
 * `44px` square with no text in it, so it needs no glyph width — its contribution to a
 * state's contents is `spacing(..., "w")`, not `GLYPH` plus padding the way every text
 * control here still is. `checkmark()` below models that; `strikeIt()` is gone with the
 * label it measured.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

/**
 * The one Tailwind fact this file needs: a spacing step is `0.25rem`, and the root font
 * size is the browser's default `16px`. `w-48` is `192px` because of these two numbers.
 */
const STEP_PX = 4;

/** Pull a named `export const X = "…"` (or a file-local `const X = "…"`) class string. */
function classStringNamed(source: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*\\n?\\s*"([^"]*)"`).exec(source);
  if (match === null) throw new Error(`no class string named ${name}`);
  return match[1];
}

/**
 * The pixel value of a Tailwind spacing utility on a class string — `px-2.5` → `10`.
 * Returns `0` when the utility is absent, which is the same thing Tailwind renders.
 */
function spacing(classes: string, prefix: string): number {
  const match = new RegExp(`(?:^| )${prefix}-(\\d+(?:\\.\\d+)?)(?: |$)`).exec(classes);
  return match === null ? 0 : Number(match[1]) * STEP_PX;
}

/** A `1px` border on each side, when the class string asks for one. */
function borderBox(classes: string): number {
  return / border(?: |$)/.test(` ${classes} `) ? 2 : 0;
}

/**
 * The pixel value of a negative Tailwind `margin-block` utility — `-my-2` → `-8`. Returns
 * `0` when the class string asks for none. Not folded into `spacing()` above: that helper
 * only ever reads a positive utility, and a negative one needs its own leading-`-` match
 * rather than a sign flipped after the fact, the same way Tailwind itself treats `-my-2`
 * as its own class rather than `my-2` negated.
 */
function negativeMarginBlock(classes: string): number {
  const match = new RegExp(`(?:^| )-my-(\\d+(?:\\.\\d+)?)(?: |$)`).exec(classes);
  return match === null ? 0 : -Number(match[1]) * STEP_PX;
}

/**
 * Glyph widths, in px, of every label the trailing slot can render.
 *
 * **The impure edge.** Measured with `getBoundingClientRect` over a `code-line` span in a
 * real Chromium tab, against `app/globals.css` compiled by Tailwind, with Archivo loaded
 * over the same `wdth 100 / wght 600` axis values `code-line` sets — the method
 * `programme-note-episodes.tsx`, `episode-line.ts` and `DESIGN.md` §6 all record their own
 * numbers by. Recomputing them here from font metrics would be a second, worse
 * implementation of a text shaper.
 *
 * These move if the type ramp moves. `DESIGN.md` §6 already records one re-cut of
 * `code-line` that broke the row's height, so that is not hypothetical — but it is also
 * exactly the change that arrives with its own re-measure, and this table is then part of
 * what gets updated.
 */
const GLYPH: Readonly<Record<string, number>> = {
  Rewatch: 48.69,
  Unwatch: 49.16,
  "Up next": 42.62,
  Watched: 49.12,
};

/** `code-line` is `0.75rem` at `1.35` — one line of it, which is every label here. */
const CODE_LINE_HEIGHT_PX = 0.75 * 16 * 1.35;

const EPISODES_SOURCE = sourceAt("app/(signed-in)/library/programme-note-episodes.tsx");
const MOTION_SOURCE = sourceAt("app/(signed-in)/library/watch-mark-motion.tsx");
const ROW_SOURCE = sourceAt("app/(signed-in)/library/episode-line.ts");
const BUTTONS_SOURCE = sourceAt("errors/recovery-buttons.ts");

const TRAILING = classStringNamed(EPISODES_SOURCE, "TRAILING");
const EPISODE_ROW = classStringNamed(ROW_SOURCE, "EPISODE_ROW");
const GHOST_COMPACT = classStringNamed(BUTTONS_SOURCE, "GHOST_RECOVERY_COMPACT");
const RECORDING_HIT_BOX = classStringNamed(MOTION_SOURCE, "RECORDING_HIT_BOX");
const QUIET_RECORDING_CONTROL = classStringNamed(MOTION_SOURCE, "QUIET_RECORDING_CONTROL");

/** One thing in the slot: how wide its box is, and how tall. */
type SlotItem = { readonly width: number; readonly height: number };

/** A bordered control wrapping one `code-line` label. */
function labelled(classes: string, label: string): SlotItem {
  const glyph = GLYPH[label];
  if (glyph === undefined) throw new Error(`no measured glyph width for ${label}`);
  return {
    width: glyph + spacing(classes, "px") * 2 + borderBox(classes),
    height: CODE_LINE_HEIGHT_PX + spacing(classes, "py") * 2 + borderBox(classes),
  };
}

/** Bare `code-line` text — the *Up next* and *Watched* labels, which have no box. */
function bare(label: string): SlotItem {
  return labelled("", label);
}

/**
 * *Watched up to here*: `QUIET_RECORDING_CONTROL` around a `h-4 w-4` glyph. The icon is
 * `block`, so it adds no descender space to the box — `MarkUpToButton`'s own docblock.
 */
function markUpTo(): SlotItem {
  const glyph = 4 * STEP_PX;
  const pad = spacing(QUIET_RECORDING_CONTROL, "p") * 2;
  return {
    width: glyph + pad + borderBox(QUIET_RECORDING_CONTROL),
    height: glyph + pad + borderBox(QUIET_RECORDING_CONTROL),
  };
}

/**
 * The checkmark — `RECORDING_HIT_BOX` around `CheckmarkIcon`, issue #217. A fixed `44px`
 * square, not a label wrapped in padding: its width is the box's own `w-11`, and its
 * height is `h-11` corrected by `-my-2`'s negative margin, the same box-model arithmetic
 * `watch-mark-motion.tsx`'s own docblock walks through — `44 − (2 × 8) = 28`, the row's
 * own budget below (`leaves $name inside the row's own height`), not `44`.
 */
function checkmark(): SlotItem {
  return {
    width: spacing(RECORDING_HIT_BOX, "w"),
    height: spacing(RECORDING_HIT_BOX, "h") + 2 * negativeMarginBlock(RECORDING_HIT_BOX),
  };
}

const rewatch = () => labelled(GHOST_COMPACT, "Rewatch");
const unwatch = () => labelled(GHOST_COMPACT, "Unwatch");

/**
 * **Every state the trailing slot can be in**, read off `EpisodeLine`'s own branching:
 * an *Up next* label when `episode.upNext && !watched`; the up-to control whenever
 * `covered !== null`, on both sides of the watched branch; then one of the checkmark
 * (unwatched), *Watched* (mid-sweep) or *Rewatch* beside *Unwatch* (settled).
 *
 * An up-next episode is by definition unwatched, so *Up next* never appears beside the
 * watched pair — that is why there are seven rows here and not nine.
 */
const STATES: readonly { readonly name: string; readonly items: readonly SlotItem[] }[] = [
  { name: "checkmark", items: [checkmark()] },
  { name: "Up next · checkmark", items: [bare("Up next"), checkmark()] },
  { name: "Watched (mid-sweep)", items: [bare("Watched")] },
  { name: "up-to · checkmark", items: [markUpTo(), checkmark()] },
  {
    name: "Up next · up-to · checkmark",
    items: [bare("Up next"), markUpTo(), checkmark()],
  },
  { name: "Rewatch · Unwatch", items: [rewatch(), unwatch()] },
  { name: "up-to · Rewatch · Unwatch", items: [markUpTo(), rewatch(), unwatch()] },
];

const SLOT_PX = spacing(TRAILING, "w");
const SLOT_GAP_PX = spacing(TRAILING, "gap");

function contentsOf(items: readonly SlotItem[]): number {
  const boxes = items.reduce((total, item) => total + item.width, 0);
  return boxes + SLOT_GAP_PX * (items.length - 1);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

describe("the episode row's trailing slot", () => {
  it("is the fixed measure the row was re-cut to", () => {
    expect(SLOT_PX).toBe(192);
    expect(SLOT_GAP_PX).toBe(8);
  });

  it.each(STATES)("holds $name without overflowing", ({ items }) => {
    expect(round(contentsOf(items))).toBeLessThanOrEqual(SLOT_PX);
  });

  /**
   * The whole point of the ticket. The row's floor is `min-h-11`; it only *is* the row's
   * height while nothing in the row is taller than the floor less the row's own padding.
   * `GHOST_RECOVERY`'s `py-2` box is `34.2px` against this budget's `28px`, which is how
   * a settled watched row reached `50.2px` while every other state sat on `44px`.
   */
  it.each(STATES)("leaves $name inside the row's own height", ({ items }) => {
    const budget = spacing(EPISODE_ROW, "min-h") - spacing(EPISODE_ROW, "py") * 2;
    expect(budget).toBe(28);
    for (const item of items) expect(round(item.height)).toBeLessThanOrEqual(budget);
  });

  /**
   * The measured numbers, pinned. `toBeLessThanOrEqual` above would still pass if a
   * change made the row *narrower* by dropping a control, so the table is asserted whole —
   * the same reason `programme-note-episodes.tsx` tabulates all seven rather than the
   * widest. The four checkmark rows are #217's own re-measure; the other three are
   * untouched since #203, because neither *Watched* mid-sweep nor the settled pair reads
   * anything from `RECORDING_HIT_BOX`.
   */
  it("matches the widths measured for #217 and, for the unaffected states, for #203", () => {
    expect(Object.fromEntries(STATES.map((s) => [s.name, round(contentsOf(s.items))]))).toEqual({
      checkmark: 44,
      "Up next · checkmark": 94.6,
      "Watched (mid-sweep)": 49.1,
      "up-to · checkmark": 78,
      "Up next · up-to · checkmark": 128.6,
      "Rewatch · Unwatch": 149.9,
      "up-to · Rewatch · Unwatch": 183.9,
    });
  });

  /**
   * Issue #195's own rule, kept: the watched pair is the same *register* as everything
   * else that ticket converted, and differs from it only in measure. If these ever come
   * apart, one of the two is drifting and `DESIGN.md` §10's "two measures, one register"
   * has stopped being true.
   */
  it("wears GHOST_RECOVERY's own treatment", () => {
    const treatment = (classes: string) =>
      classes
        .split(" ")
        .filter((c) => !/^(px|py|p)-/.test(c) && c !== "shrink-0")
        .sort();

    expect(treatment(GHOST_COMPACT)).toEqual(
      treatment(classStringNamed(BUTTONS_SOURCE, "GHOST_RECOVERY")),
    );
  });

  /**
   * #203's own measure, pinned now that there is nothing left to derive it from. Until
   * issue #217 this compared `GHOST_COMPACT`'s padding to `RECORDING_CONTROL`'s, because
   * #203 had borrowed it character for character. #217 gave the row's own recording
   * control a `44px` hit box with no `px`/`py` of its own (`RECORDING_HIT_BOX` is sized by
   * `h-11`/`w-11`, not padding), so that comparison has nothing left to read on the other
   * side. `GHOST_RECOVERY_COMPACT`'s `px-2.5 py-1` did not change and is not wrong; it is
   * simply its own constant now rather than a live copy of another one.
   */
  it("keeps the px-2.5 py-1 measure #203 gave it", () => {
    expect(spacing(GHOST_COMPACT, "px")).toBe(10);
    expect(spacing(GHOST_COMPACT, "py")).toBe(4);
  });

  /**
   * The regression itself, named. `GHOST_RECOVERY` is a fine control on a surface and a
   * broken one in this slot, so the row is held to not reaching for it again.
   *
   * Comments are stripped first, for the reason `underline-audit.test.ts` strips them:
   * this row's docblocks discuss `GHOST_RECOVERY` at length — they have to, since
   * explaining why the compact measure exists means naming the one it replaced — and prose
   * about a mistake is not the mistake.
   */
  it("does not put the surface-measure ghost back on the row", () => {
    const code = EPISODES_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(code).not.toMatch(/\bGHOST_RECOVERY\b(?!_COMPACT)/);
  });
});
