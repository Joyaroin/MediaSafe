import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The surface's one server action pulls in the database and TMDB; no phase drawn here
// calls it, so it is stubbed rather than resolved.
vi.mock("@/app/(signed-in)/import/actions", () => ({ applyImportChunkAction: vi.fn() }));

const { ImportPhase } = await import("@/app/(signed-in)/import/import-surface");
type Phase = import("@/app/(signed-in)/import/import-surface").Phase;

/**
 * Issue #406 — import's five phases, redrawn (handoff §8.12). Each is rendered on its own
 * through `ImportPhase` and asserted on the markup, the way `tests/sign-in-treatment.test.ts`
 * renders the standalone instruction: the wording is `states.png`'s, which is the reference
 * for it (handoff §9).
 */
function render(phase: Phase): string {
  const noop = () => {};
  return renderToStaticMarkup(
    createElement(ImportPhase, { phase, onChoose: noop, chooseAgain: noop, retry: noop }),
  );
}

/** Markup as the reader hears it: tags dropped, whitespace collapsed. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const RUN = { totalTitles: 472, titlesAdded: 212, watchesAdded: 1804, abandonedAdded: 9 };

describe("choose", () => {
  const markup = render({ kind: "choose" });

  it("says what picking a file does, in the board's words", () => {
    expect(text(markup)).toContain(
      "Pick your export file. MediaSafe writes it about 25 titles at a time, right on this screen. Keep it open until it says the import is done.",
    );
  });

  it("offers one file picker as the filled action", () => {
    expect(markup).toContain('type="file"');
    expect(text(markup)).toContain("Choose your file");
  });
});

describe("running", () => {
  const markup = render({ kind: "running", ...RUN });

  it("keeps role=status on the card that holds the count", () => {
    expect(markup).toMatch(/<section role="status"[^>]*>.*212.*of 472 titles/);
  });

  it("draws a bar of written over total", () => {
    expect(markup).toContain(`width:${(212 / 472) * 100}%`);
  });

  it("shows watches and dropped as figures, grouped like every other count", () => {
    expect(text(markup)).toContain("1,804 watches");
    expect(text(markup)).toContain("9 marked dropped");
  });

  it("says why picking the file again is safe, under the card", () => {
    expect(text(markup)).toContain(
      "Written about 25 titles at a time. Nothing already written is touched twice, so picking the same file again is always safe.",
    );
  });

  it("draws an empty bar for a file with no titles rather than dividing by zero", () => {
    expect(render({ kind: "running", ...RUN, totalTitles: 0, titlesAdded: 0 })).toContain(
      "width:0%",
    );
  });
});

describe("done", () => {
  const markup = render({
    kind: "done",
    totalTitles: 472,
    titlesAdded: 472,
    watchesAdded: 3960,
    abandonedAdded: 14,
    skipped: [
      { kind: "film", tmdbId: 101 },
      { kind: "show", tmdbId: 202 },
    ],
  });

  it("says the file is written, with the counter line", () => {
    expect(text(markup)).toContain("Import done");
    expect(text(markup)).toContain(
      "Your file has been written in full. Running it again changes nothing that is already here.",
    );
    expect(text(markup)).toContain("472 of 472 titles · 3,960 watches · 14 marked dropped");
  });

  it("lists what TMDB could not find", () => {
    expect(text(markup)).toContain("2 titles TMDB could not find, skipped");
    expect(text(markup)).toContain("Film · TMDB 101");
    expect(text(markup)).toContain("Show · TMDB 202");
  });

  it("ends at a link into the library, not at the count", () => {
    expect(markup).toMatch(/<a[^>]*href="\/library"[^>]*>Open your library<\/a>/);
  });
});

describe("stopped", () => {
  const markup = render({ kind: "halted", ...RUN, reference: "abc123", skipped: [] });

  it("is a failure: Row heading, the sentence, the counter and the reference line", () => {
    expect(text(markup)).toContain("The import stopped");
    expect(text(markup)).toContain(
      "Something went wrong partway through your file. What was already written stays written, and the rest has not been touched. Running it again is safe.",
    );
    expect(text(markup)).toContain("212 of 472 titles · 1,804 watches · 9 marked dropped");
    expect(text(markup)).toContain("Reference abc123");
    expect(text(markup)).toContain("Try again");
  });

  it("leaves the reference line out when there is no event", () => {
    expect(render({ kind: "halted", ...RUN, reference: null, skipped: [] })).not.toContain(
      "Reference",
    );
  });
});

describe("the file could not be read", () => {
  const markup = render({
    kind: "invalid",
    message: "This file is not one MediaSafe can read.",
    reference: null,
  });

  it("names the file, gives the reader's sentence and offers another file", () => {
    expect(text(markup)).toContain("This file could not be read");
    expect(text(markup)).toContain("This file is not one MediaSafe can read.");
    expect(text(markup)).toContain("Choose a different file");
  });
});

describe("the counter's wording", () => {
  it("says dropped, matching the Library filter, never abandoned", () => {
    for (const phase of [
      { kind: "running", ...RUN },
      { kind: "halted", ...RUN, reference: null, skipped: [] },
      { kind: "done", ...RUN, skipped: [] },
    ] as const) {
      const said = text(render(phase));
      expect(said).toContain("marked dropped");
      expect(said).not.toMatch(/abandoned/i);
    }
  });
});
