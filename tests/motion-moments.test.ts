import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOLD_MS } from "@/app/(signed-in)/up-next/up-next-card";
import { UNDO_WINDOW_MS } from "@/app/(signed-in)/up-next/up-next-mark";

/**
 * Charcoal 13, issue #407 — *Nothing teleports* (handoff §11.1, §11.2, §11.4).
 *
 * What a static read can hold the motion moments to: the two new tokens and their roles,
 * the timings a moment must never move, the guardrail that nothing animates a size, and
 * that every new moment has its reduced-motion version. The moments themselves are played
 * in a browser by `tests/e2e/up-next-motion.spec.ts`.
 */

const CSS = readFileSync("app/globals.css", "utf8");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => " ".repeat(block.length));
const at = (file: string) => readFileSync(file, "utf8");

const FEATURED = at("app/(signed-in)/up-next/tonight-featured.tsx");
const ROW = at("app/(signed-in)/up-next/up-next-episode-row.tsx");
const FILM = at("app/(signed-in)/up-next/film-row.tsx");
const LIST = at("app/(signed-in)/up-next/tonight-list.tsx");
const CARD = at("app/(signed-in)/up-next/up-next-card.tsx");
const FLIGHT = at("app/poster-flight.ts");

/** The body of `@utility name { … }` or of a plain rule, up to its closing brace. */
function block(selector: string): string {
  const start = CSS_CODE.indexOf(selector);
  expect(start, `${selector} is declared`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = CSS_CODE.indexOf("{", start); index < CSS_CODE.length; index += 1) {
    if (CSS_CODE[index] === "{") depth += 1;
    if (CSS_CODE[index] === "}") depth -= 1;
    if (depth === 0) return CSS_CODE.slice(start, index + 1);
  }
  throw new Error(`${selector} never closes`);
}

describe("the two new tokens (handoff §11.1)", () => {
  it("declares the roll at 280ms and the travel at 420ms", () => {
    expect(CSS_CODE).toMatch(/--dur-roll:\s*280ms;/);
    expect(CSS_CODE).toMatch(/--dur-travel:\s*420ms;/);
  });

  it("times the roll, both ways, on --dur-roll", () => {
    expect(block("@utility roll-in")).toContain("var(--dur-roll)");
    expect(block("@utility roll-out")).toContain("var(--dur-roll)");
  });

  it("times the travelling poster and the lost write's rewind on --dur-travel", () => {
    expect(block("@utility poster-flight")).toContain("var(--dur-travel)");
    expect(block("@utility tick-rewind")).toContain("var(--dur-travel)");
  });

  it("travels on the travel curve, as §11.1's easing by role says", () => {
    expect(block("@utility poster-flight")).toContain("var(--ease-in-out-soft)");
    expect(block("@utility tick-rewind")).toContain("var(--ease-in-out-soft)");
  });
});

describe("motion changes what is drawn, never when a write is sent", () => {
  it("leaves the mark hold at 1200ms and the Undo window at 6000ms", () => {
    expect(HOLD_MS).toBe(1_200);
    expect(UNDO_WINDOW_MS).toBe(6_000);
  });

  it("drains the Undo ring for the hold itself, not a second copy of it", () => {
    // Undo is on screen for the hold, so the ring is `HOLD_MS`, handed down — never typed.
    expect(CARD).toMatch(/shownMs = HOLD_MS/);
    expect(CARD).toMatch(/"--undo-shown": `\$\{shownMs\}ms`/);
    expect(block("@utility undo-ring")).toContain("var(--undo-shown)");
    expect(block("@utility undo-ring")).toContain("linear");
  });

  it("adds no write path: the rows and the featured episode still press the store's mark", () => {
    for (const source of [FEATURED, ROW]) {
      expect(source).not.toMatch(/markFromCard|watchMarks\.mark|fetch\(/);
    }
    expect(FILM).toMatch(/holdOverWhile\(attempt\(\)\)/);
  });
});

/**
 * Handoff §11.4: *never animate `width`, `height`, `margin` or `gap` directly.* Read across
 * the whole shipping tree, because a size animated anywhere is the same mistake.
 */
describe("nothing animates a size", () => {
  const SOURCES = walk("app").filter((file) => /\.(tsx?|css)$/.test(file));
  const SIZE = "(?:max-|min-)?(?:width|height)|margin(?:-[a-z]+)?|(?:row-|column-)?gap";

  it.each(SOURCES)("%s", (file) => {
    const code = at(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // Tailwind: `transition-[width]`, `transition-[max-height,opacity]`, …
    expect(code).not.toMatch(new RegExp(`transition-\\[[^\\]]*\\b(?:${SIZE})\\b`));
    // CSS: `transition: width …`, `transition-property: height`, `transition: …, gap …`.
    expect(code).not.toMatch(
      new RegExp(`transition(?:-property)?:[^;{}]*(?:^|[\\s,:])(?:${SIZE})[\\s;,]`, "m"),
    );
    // Motion: `animate={{ height: … }}`, `exit={{ width: … }}`.
    expect(code).not.toMatch(
      new RegExp(`(?:animate|exit|initial|whileHover|whileTap)=\\{\\{[^}]*\\b(?:${SIZE})\\s*:`),
    );
  });
});

describe("the moments (handoff §11.2)", () => {
  it("narrows the featured button into the held tick as one shape, on smooth", () => {
    expect(FEATURED.match(/layoutId=\{shape\}/g)).toHaveLength(2);
    expect(FEATURED).toMatch(/transition=\{smooth\}/);
  });

  it("rolls only the featured episode line and the count", () => {
    expect(FEATURED.match(/<Roll\b/g)).toHaveLength(2);
  });

  it("joins the season's segments by layout, never by animating the gap", () => {
    expect(FEATURED).toMatch(/joined=\{finish !== null\}/);
    expect(FEATURED).toMatch(/<m\.span\s+key=\{index\}\s+layout/);
  });

  it("sets the finish line in italic serif", () => {
    const rule = block(".finish-line {");
    expect(rule).toContain("var(--font-display)");
    expect(rule).toContain("italic");
  });

  it("pops the row's tick, rings it while Undo is offered, and rewinds it on a lost write", () => {
    expect(CARD).toMatch(/check-pop \$\{WATCHED_TICK\}/);
    expect(CARD).toMatch(/onUndo === null \? null : <UndoRing/);
    expect(ROW).toMatch(/lost\s*\?\s*`\$\{RECORDING_GLYPH\} tick-rewind`/);
    expect(FILM).toMatch(/lost\s*\?\s*`\$\{RECORDING_GLYPH\} tick-rewind`/);
  });

  it("closes a leaving row by layout, the rows below taking its place", () => {
    expect(LIST.match(/<AnimatePresence initial=\{false\} mode="popLayout">/g)).toHaveLength(2);
    for (const source of [ROW, FILM]) {
      expect(source).toMatch(/layout="position"\s+transition=\{smooth\}/);
    }
  });

  it("sends a finished row's poster to its tab, and a film's to Library", () => {
    expect(ROW).toMatch(/leavesFor=\{leaving \? leavesFor\(entry, showing\) : null\}/);
    expect(FILM).toMatch(/useFlightOnLeave\(link, leaving \? "\/library" : null\)/);
    for (const nav of ["app/tab-bar.tsx", "app/sidebar-nav.tsx"]) {
      expect(at(nav)).toContain("data-nav-icon={href}");
    }
  });
});

describe("reduced motion is a fade, never a cut — issue #471 (handoff §11.1, §11.2)", () => {
  const reducedBlocks = [
    ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
  ].map((match) => match[0]);
  const reduced = reducedBlocks.join("\n");

  it("finds every reduced-motion block in the stylesheet", () => {
    // A floor so a regex slip (the lazy match swallowing less than a whole block) cannot
    // make every assertion below vacuously pass.
    expect(reducedBlocks.length).toBeGreaterThanOrEqual(10);
  });

  it("collapses no duration to 1ms or 0s anywhere in a reduced-motion rule", () => {
    for (const block of reducedBlocks) {
      expect(block).not.toMatch(/animation-duration:\s*1ms/);
      expect(block).not.toMatch(/transition-duration:\s*1ms/);
      expect(block).not.toMatch(/animation-duration:\s*0s/);
      expect(block).not.toMatch(/transition-duration:\s*0s/);
    }
  });

  it("rolls the line at its own pace, dropping only the travel", () => {
    const rollBlock = reducedBlocks.find((candidate) => /@keyframes roll-in/.test(candidate));
    expect(rollBlock, "the roll's reduced-motion block").toBeTruthy();
    expect(rollBlock).toMatch(/@keyframes roll-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*\}/);
    expect(rollBlock).toMatch(/@keyframes roll-out\s*\{\s*to\s*\{\s*opacity:\s*0;\s*\}\s*\}/);
  });

  it("sends no poster and nods no tab under reduced motion — poster-flight.ts never starts either", () => {
    // `tab-nod` is only ever added by `flyPosterToTab`, which already returns before doing
    // anything when the OS asks for reduced motion (the assertion below), so the class
    // never reaches the DOM there. The keyframe redefinition is what keeps the *stylesheet*
    // honest regardless: if it were ever applied it would still only sit inert at
    // `--dur-pop`, never snap through a collapsed one.
    expect(FLIGHT).toMatch(/prefers-reduced-motion: reduce\)"\)\.matches\) return;/);
    const tabNodBlock = reducedBlocks.find((candidate) => /@keyframes tab-nod/.test(candidate));
    expect(tabNodBlock, "the tab-nod reduced-motion block").toBeTruthy();
    expect(tabNodBlock).toMatch(/@keyframes tab-nod\s*\{\s*40%\s*\{\s*transform:\s*none;\s*\}\s*\}/);
  });

  it("leaves the tick's rewind and the held reveal at full pace — neither ever moved through space", () => {
    // `tick-rewind` only ever changes colour and `held-reveal` only ever changes opacity,
    // so neither needed a collapse: the fix is removing the forced one, not redefining
    // either rule.
    expect(reduced).not.toMatch(/\.tick-rewind\b[^{]*\{[^}]*animation-duration/);
    expect(reduced).not.toMatch(/\.held-reveal\b[^{]*\{[^}]*transition-duration/);
  });

  it("fades the watch-sweep's wash, holding its width constant rather than dropping transform outright", () => {
    const sweepBlock = reducedBlocks.find((candidate) => /@keyframes watch-sweep-in/.test(candidate));
    expect(sweepBlock, "the watch-sweep reduced-motion block").toBeTruthy();
    // The wash's own `transform: scaleX(0)` (outside this block) would make it zero-width
    // for its whole run if this block dropped `transform` outright, so both frames hold it
    // at `scaleX(1)` instead — the value never changes, only `opacity` does.
    expect(sweepBlock).toMatch(/0%\s*\{\s*transform:\s*scaleX\(1\);\s*opacity:\s*0\.3;\s*\}/);
    expect(sweepBlock).toMatch(/100%\s*\{\s*transform:\s*scaleX\(1\);\s*opacity:\s*0;\s*\}/);
  });

  it("fades the watch-hold's wash and the recorded check's pop, dropping only their scale", () => {
    const holdBlock = reducedBlocks.find(
      (candidate) => /@keyframes watch-hold-in/.test(candidate) && /@keyframes check-pop/.test(candidate),
    );
    expect(holdBlock, "the watch-hold/check-pop reduced-motion block").toBeTruthy();
    expect(holdBlock).not.toMatch(/transform/);
    expect(holdBlock).toMatch(/@keyframes watch-hold-in\s*\{\s*0%\s*\{\s*opacity:\s*1;\s*\}\s*100%\s*\{\s*opacity:\s*0;\s*\}\s*\}/);
  });

  it("leaves the stagger rising at --dur-base, dropping only the rise itself", () => {
    const riseBlock = reducedBlocks.find((candidate) => /\.stagger-rise > \*/.test(candidate));
    expect(riseBlock, "the stagger-rise reduced-motion block").toBeTruthy();
    expect(riseBlock).not.toMatch(/animation-duration/);
  });

  it("drops only the slide on the progress bars, and leaves arrive-fast running at full pace", () => {
    // The fill is pure `transform` with no opacity of its own, so the rule cannot drop
    // `transform` the way the other moments drop theirs — it still has to reach its new
    // value. `transition: none` removes the slide instead: the fill jumps there rather
    // than cutting through a collapsed duration.
    expect(reduced).toMatch(/\.progress-fill\s*\{\s*transition:\s*none;\s*\}/);
    // `nav-fade`, the keyframe `arrive-fast` runs, only ever changes opacity — there was
    // never a rise to drop, so there is no reduced-motion rule for it at all any more.
    expect(reduced).not.toMatch(/\.arrive-fast\b/);
  });

  it("drops the Undo ring entirely, and Undo stays", () => {
    expect(reduced).toMatch(/\.undo-ring\s*\{\s*display:\s*none;/);
  });
});

/**
 * Issue #462 — *the rows rise quickly*. Arriving at Library, Tonight or Search used to
 * stagger at 30ms a row over `--dur-slow` (380ms), so the ninth row didn't land until
 * 240ms (delay) + 380ms (rise) = 620ms. `--stagger-step` makes the per-row gap a token
 * rather than a literal, and the rise itself moves onto `--dur-base` (220ms), so the same
 * ninth row lands at 160ms + 220ms = 380ms — the figure the ticket names.
 */
describe("the stagger ramp (issue #462)", () => {
  it("declares --stagger-step: 20ms on the ramp", () => {
    expect(CSS_CODE).toMatch(/--stagger-step:\s*20ms;/);
  });

  it("sets Tailwind's default transition timing function to the app's own ease-out", () => {
    const theme = block("@theme");
    expect(theme).toMatch(/--default-transition-timing-function:\s*var\(--ease-out-quart\);/);
  });

  it("rises on --dur-base and steps the first nine children by multiples of --stagger-step", () => {
    const rise = block("@utility stagger-rise");

    expect(rise).toMatch(/animation:\s*rise-in\s+var\(--dur-base\)\s+var\(--ease-press\)\s+backwards;/);

    for (let n = 1; n <= 9; n += 1) {
      const delay = (n - 1) * 20;
      expect(rise, `child ${n}`).toMatch(
        new RegExp(`:nth-child\\(${n}\\)\\s*\\{\\s*animation-delay:\\s*${delay}ms;`),
      );
    }
  });

  it("still stops the rise at the tenth child, not merely the delay", () => {
    const rise = block("@utility stagger-rise");
    expect(rise).toMatch(/:nth-child\(n \+ 10\)\s*\{\s*animation:\s*none;/);
  });

  it("lands the ninth row by 380ms, the figure the ticket names", () => {
    const durBase = Number(CSS_CODE.match(/--dur-base:\s*(\d+)ms;/)![1]);
    const step = Number(CSS_CODE.match(/--stagger-step:\s*(\d+)ms;/)![1]);
    expect(8 * step + durBase).toBe(380);
  });
});

/**
 * Issue #468 — *both title pages arrive on the page transition's clock*. `arrive-panel`
 * used to replay a hand-typed 420ms rise on top of the page transition's 190ms, so the
 * hero kept moving after the reader had started reading. It now runs the one arrival
 * every other entrance uses: `--dur-base` on the arrival curve, with the 420ms literal
 * deleted rather than moved onto `--dur-travel` (that token names something travelling to
 * another place, not an arrival).
 */
describe("the title page arrives on the page transition's clock (issue #468)", () => {
  it("runs arrive-panel on --dur-base with the arrival curve", () => {
    const panel = block("@utility arrive-panel");
    expect(panel).toMatch(/animation:\s*rise-in\s+var\(--dur-base\)\s+var\(--ease-press\)\s+backwards;/);
  });

  it("leaves no duration literal in the rule", () => {
    const panel = block("@utility arrive-panel");
    expect(panel).not.toMatch(/\d+m?s\b/);
  });

  it("fades on --dur-base without the rise under reduced motion", () => {
    // `arrive-panel` carries no reduced-motion override of its own: it inherits the
    // shared `rise-in` keyframe's reduced-motion redefinition (opacity only, no
    // transform) and keeps --dur-base as its duration, so the fade runs no faster or
    // slower under reduced motion than it does at full motion.
    expect(CSS_CODE).not.toMatch(/\.arrive-panel\b[^{]*\{\s*animation-duration:/);
  });
});

/**
 * Issue #472, handoff §11.2's *the Watched. Undo toast enters from 8px above with a fade
 * and leaves the same way* — the write-failure toast's own mechanism
 * (`write-failure-toast-transition`, asserted the same way a few blocks up this file in
 * spirit, though that rule predates this one), mirrored at the opposite corner: the
 * action toast sits at the top of the viewport, so it moves the other way, up instead of
 * down, on the entrance and the exit alike — "every toast moves this one way, from the
 * edge it sits on."
 */
describe("the action toast arrives and leaves (issue #472)", () => {
  it("enters from 8px above with a fade, on --dur-slow and the arrival curve", () => {
    const rule = block("@utility action-toast-transition");
    expect(rule).toContain("opacity: 1;");
    expect(rule).toContain("transform: none;");
    expect(rule).toMatch(/opacity var\(--dur-slow\) var\(--ease-press\)/);
    expect(rule).toMatch(/transform var\(--dur-slow\) var\(--ease-press\)/);

    const starting = CSS_CODE.match(
      /@starting-style\s*\{\s*\.action-toast-transition\s*\{([^}]*)\}/,
    );
    expect(starting, "a @starting-style block for .action-toast-transition").toBeTruthy();
    expect(starting![1]).toMatch(/opacity:\s*0;/);
    expect(starting![1]).toMatch(/transform:\s*translateY\(-8px\);/);
  });

  it("leaves upward on --dur-fast while data-leaving=\"true\" is held", () => {
    const leaving = block('.action-toast-transition[data-leaving="true"]');
    expect(leaving).toMatch(/opacity:\s*0;/);
    expect(leaving).toMatch(/transform:\s*translateY\(-8px\);/);
    expect(leaving).toMatch(/opacity var\(--dur-fast\) var\(--ease-out-quart\)/);
    expect(leaving).toMatch(/transform var\(--dur-fast\) var\(--ease-out-quart\)/);
  });

  it("drops only the travel under reduced motion — both fades keep their durations", () => {
    const reducedBlocks = [
      ...CSS_CODE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g),
    ].map((match) => match[0]);
    const reduced = reducedBlocks.join("\n");

    expect(reduced).toMatch(/\.action-toast-transition\b/);
    expect(reduced).toMatch(/\.action-toast-transition\[data-leaving="true"\]/);
    // Neither duration is collapsed anywhere in a reduced-motion rule (the shared
    // assertion above already proves this file-wide; this just names the two rules
    // involved so a future edit that narrows that shared check still has to look here).
    for (const selector of [
      '.action-toast-transition',
      '.action-toast-transition[data-leaving="true"]',
    ]) {
      const segment = reduced.slice(reduced.indexOf(selector));
      expect(segment.slice(0, 200)).not.toMatch(/transition-duration:\s*(?:1ms|0s)/);
    }
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
