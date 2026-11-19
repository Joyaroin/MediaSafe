import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as declared from "@/app/accent-meaning";
import {
  RECORDS_A_WATCH,
  THE_BUTTON_REGISTER,
  type AccentMeaning,
} from "@/app/accent-meaning";
import { EPISODE_NUMBER_UP_NEXT } from "@/app/(signed-in)/library/episode-line";
import { stateLabel } from "@/app/(signed-in)/library/library-state";

/**
 * Issue #310 — the accent's meanings, named as constants. Two since Charcoal's sweep (#409)
 * retired the live edge, whose last call site had no renderer.
 *
 * The older worked examples (`rating-control.tsx`, `up-next-tile.tsx`) are
 * stale — neither file exists in this tree — so this suite is written against the current
 * call sites, read directly out of `library-state.ts` and
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
    expect(stateLabel("show", "watching")).toBe("Watching");
    expect(source("app/(signed-in)/library/library-state.ts")).not.toContain("accent-meaning");
  });
});

describe("the library's controls carry no live edge — Charcoal, issue #397", () => {
  // The Watching chip used to keep `LIVE_EDGE_OF_THE_RECORD.ink` even unselected. The chips
  // went with the sections (#552); what is left of the library's controls, the sort, must not
  // bring the retired meaning back.
  it("no longer imports the live edge at all", () => {
    expect(source("app/(signed-in)/library/library-sort-select.tsx")).not.toMatch(
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
