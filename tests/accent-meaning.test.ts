import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import * as declared from "@/app/accent-meaning";
import {
  RECORDS_A_WATCH,
  THE_BUTTON_REGISTER,
  type AccentMeaning,
} from "@/app/accent-meaning";
import { EPISODE_NUMBER_UP_NEXT } from "@/app/(signed-in)/library/episode-line";
import { LibraryChips } from "@/app/(signed-in)/library/library-filter-bar";
import { STATE_LABELS } from "@/app/(signed-in)/library/library-state";

/**
 * Issue #310 — the accent's meanings, named as constants. Two since Charcoal's sweep (#409)
 * retired the live edge, whose last call site had no renderer.
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
  THE_BUTTON_REGISTER,
};

describe("the meanings all resolve to the one declared accent token", () => {
  it.each(Object.keys(MEANINGS))("%s's ink is the accent text token", (name) => {
    expect(MEANINGS[name].ink).toBe("text-accent");
  });

  it.each(Object.keys(MEANINGS))("%s's solid is the accent ground with accent-ink text", (name) => {
    expect(MEANINGS[name].solid).toBe("bg-accent text-accent-ink");
  });

  it("names two meanings, not one repeated twice", () => {
    // Distinguished by what each one claims, not by rendering — the whole point of #300's
    // ruling is that the token never changes, only the reason a call site may reach for it.
    const claims = new Set(Object.values(MEANINGS).map((m) => m.claims));
    expect(claims.size).toBe(2);
  });

  it("documents what each meaning claims, in a full sentence", () => {
    for (const m of Object.values(MEANINGS)) {
      expect(m.claims.length).toBeGreaterThan(20);
    }
  });
});

describe("the live edge is retired — Charcoal's sweep, issue #409", () => {
  it("is no longer declared", () => {
    expect(Object.keys(declared)).not.toContain("LIVE_EDGE_OF_THE_RECORD");
  });

  it("leaves the Watching label as words alone, painted by the surface that prints it", () => {
    expect(STATE_LABELS.watching).toEqual({ label: "Watching" });
    expect(source("app/(signed-in)/library/library-state.ts")).not.toContain("accent-meaning");
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

describe("the up-next episode is marked by its row, not a colour — Charcoal, issue #403", () => {
  // `EPISODE_NUMBER_UP_NEXT` used to be the live edge's solid chip. With the accent equal
  // to `text` that chip is only a pale square, and handoff §5.2 marks the Up next episode
  // by its label and a raised row instead (`EPISODE_ROW_UP_NEXT`). The number is the same
  // serif numeral as every other, in `text` rather than `dim`. No meaning is added.
  it("draws the up-next number as the plain numeral, in text, with no accent", () => {
    expect(EPISODE_NUMBER_UP_NEXT).toContain("text-text");
    expect(EPISODE_NUMBER_UP_NEXT).not.toMatch(/\b(?:bg|text)-accent/);
  });

  it("no longer imports the live edge at all", () => {
    expect(source("app/(signed-in)/library/episode-line.ts")).not.toMatch(
      /import[^;]*LIVE_EDGE_OF_THE_RECORD/,
    );
  });
});
