import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LIVE_EDGE_OF_THE_RECORD,
  RECORDS_A_WATCH,
  THE_BUTTON_REGISTER,
  type AccentMeaning,
} from "@/app/accent-meaning";
import { EPISODE_NUMBER_UP_NEXT } from "@/app/(signed-in)/library/episode-line";
import { LibraryChips } from "@/app/(signed-in)/library/library-filter-bar";
import { STATE_LABELS } from "@/app/(signed-in)/library/library-state";

/**
 * Issue #310 — the accent's three meanings, named as constants, and the live-edge one
 * wired to the three surfaces that were already painting it before anything said so.
 *
 * The older worked examples (`rating-control.tsx`, `up-next-tile.tsx`) are
 * stale — neither file exists in this tree — so this suite is written against the current
 * call sites, read directly out of `library-state.ts`, `library-filter-bar.tsx` and
 * `episode-line.ts`, rather than transcribed from the issue.
 */

const ROOT = join(__dirname, "..");

/** Source text, so migration is checked by what the call site *does*, not merely by what
 *  it happens to render — a file could coincidentally render `text-accent` without ever
 *  importing the meaning it is supposed to be declaring. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

const MEANINGS: Record<string, AccentMeaning> = {
  RECORDS_A_WATCH,
  LIVE_EDGE_OF_THE_RECORD,
  THE_BUTTON_REGISTER,
};

describe("the three meanings all resolve to the one declared accent token", () => {
  it.each(Object.keys(MEANINGS))("%s's ink is the accent text token", (name) => {
    expect(MEANINGS[name].ink).toBe("text-accent");
  });

  it.each(Object.keys(MEANINGS))("%s's solid is the accent ground with accent-ink text", (name) => {
    expect(MEANINGS[name].solid).toBe("bg-accent text-accent-ink");
  });

  it("names three meanings, not one repeated three times", () => {
    // Distinguished by what each one claims, not by rendering — the whole point of #300's
    // ruling is that the token never changes, only the reason a call site may reach for it.
    const claims = new Set(Object.values(MEANINGS).map((m) => m.claims));
    expect(claims.size).toBe(3);
  });

  it("documents what each meaning claims, in a full sentence", () => {
    for (const m of Object.values(MEANINGS)) {
      expect(m.claims.length).toBeGreaterThan(20);
    }
  });
});

describe("the live edge of the record is what the Watching label paints", () => {
  const LIBRARY_STATE = "app/(signed-in)/library/library-state.ts";

  it("STATE_LABELS.watching carries the live-edge ink and nothing else", () => {
    expect(STATE_LABELS.watching.className).toBe(LIVE_EDGE_OF_THE_RECORD.ink);
  });

  it("renders identically to the accent text it always did", () => {
    // #310's acceptance criteria: a declaration change, not a visual one.
    expect(STATE_LABELS.watching.className).toBe("text-accent");
  });

  it("declares the meaning by importing it, rather than reaching for the colour directly", () => {
    const code = source(LIBRARY_STATE);
    expect(code).toMatch(/import\s*\{\s*LIVE_EDGE_OF_THE_RECORD\s*\}\s*from\s*"@\/app\/accent-meaning"/);
    expect(code).toContain("LIVE_EDGE_OF_THE_RECORD.ink");
  });
});

describe("the Watching chip looks like every other chip — Charcoal, issue #397", () => {
  // The chip used to keep `LIVE_EDGE_OF_THE_RECORD.ink` even unselected. With no accent hue
  // it would only have been `text`, and handoff §5.2 has it look like every other chip: the
  // Up next episode is marked by its label and its row instead, not by a colour.
  const markup = (value: "all" | "watching" = "all") =>
    renderToStaticMarkup(createElement(LibraryChips, { value, onChange: () => {} }));

  const chipButton = (html: string, label: string) =>
    [...html.matchAll(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)]
      .map((match) => match[0])
      .find((button) => button.includes(`>${label}<`));

  it("draws the unselected Watching chip exactly as the unselected Finished chip", () => {
    const html = markup("all");
    const faceOf = (label: string) => chipButton(html, label)?.replace(`>${label}<`, "><");

    expect(faceOf("Watching")).toBeDefined();
    expect(faceOf("Watching")).toBe(faceOf("Finished"));
  });

  it("still marks Watching selected the way every chip is — pressed, not painted", () => {
    expect(chipButton(markup("watching"), "Watching")).toContain('aria-pressed="true"');
  });

  it("no longer imports the live edge at all", () => {
    expect(source("app/(signed-in)/library/library-filter-bar.tsx")).not.toMatch(
      /import[^;]*LIVE_EDGE_OF_THE_RECORD/,
    );
  });
});

describe("the live edge of the record is what the up-next episode's code paints", () => {
  it("EPISODE_NUMBER_UP_NEXT carries the live-edge solid form", () => {
    expect(EPISODE_NUMBER_UP_NEXT).toContain(LIVE_EDGE_OF_THE_RECORD.solid);
  });

  it("renders identically to the solid accent chip it always did — same classes, order aside", () => {
    // Tailwind applies a class list as a set, not a sequence, so the meaning constant is
    // free to group `bg-accent`/`text-accent-ink` together without changing the paint —
    // and this is the property #310's acceptance criteria actually asks for ("renders
    // identically"), not byte-for-byte identity with the pre-migration literal.
    expect(new Set(EPISODE_NUMBER_UP_NEXT.split(" "))).toEqual(
      new Set("code-line w-9 shrink-0 bg-accent px-1 py-0.5 text-center text-accent-ink".split(" ")),
    );
  });

  it("declares the meaning by importing it, rather than reaching for the colour directly", () => {
    const code = source("app/(signed-in)/library/episode-line.ts");
    expect(code).toMatch(/import\s*\{\s*LIVE_EDGE_OF_THE_RECORD\s*\}\s*from\s*"@\/app\/accent-meaning"/);
    expect(code).toContain("LIVE_EDGE_OF_THE_RECORD.solid");
  });
});
