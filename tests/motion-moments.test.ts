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

describe("every new moment has its still version", () => {
  const reduced = CSS_CODE.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g)!.join(
    "\n",
  );

  it("swaps a rolled line, a rewound tick and a nod at once", () => {
    for (const name of ["roll-in", "roll-out", "tick-rewind", "tab-nod"]) {
      expect(reduced, name).toMatch(new RegExp(`\\.${name}\\b[^{]*\\{?[\\s\\S]*?animation-duration:\\s*1ms`));
    }
  });

  it("drops the Undo ring entirely, and Undo stays", () => {
    expect(reduced).toMatch(/\.undo-ring\s*\{\s*display:\s*none;/);
  });

  it("sends no poster under reduced motion — the row just disappears", () => {
    expect(FLIGHT).toMatch(/prefers-reduced-motion: reduce\)"\)\.matches\) return;/);
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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
