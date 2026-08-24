import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_KIND_MODE, KIND_MODES } from "@/app/(signed-in)/library/kind-mode";
import { LIBRARY_STATES } from "@/db/access";
import { initialsOf } from "@/app/poster";

/**
 * The Films/Shows mode, and the things about it that would go wrong **silently**.
 *
 * The mode is the largest departure in this change: `CONTEXT.md` organises a library by
 * where a title stands, and this makes kind a mode of two screens. Most of it is visible
 * the moment you press the control. These are the parts that are not.
 */

/**
 * Comments stripped, and it is load-bearing rather than tidy.
 *
 * Every file here explains *why* the avoid-words are avoided, so it names them — and a
 * check that scanned raw text could only pass by leaving the reasoning out, which is the
 * opposite of what this codebase wants. `tests/unowned-title-surface.test.ts` strips for
 * the same reason and this is its function.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const CONTEXT = readFileSync("CONTEXT.md", "utf8");
const FILM_GROUPS = code("app/(signed-in)/library/film-groups.tsx");
const SURFACE = code("app/(signed-in)/library/library-surface.tsx");
const KIND_MODE_CONTROL = code("app/(signed-in)/library/kind-mode-control.tsx");

describe("the words the mode puts on screen", () => {
  /**
   * `CONTEXT.md` is the glossary and it binds the words on screen. The reference this
   * screen was drawn from says *Movies*, *Plan to Watch* and *Completed*, and the first
   * two are named avoid-words in that file. A control is exactly where a borrowed word
   * slips in, because it is two words in a design and nobody re-reads the glossary for
   * two words.
   */
  it("says Films and Shows, never Movies or TV", () => {
    expect(KIND_MODES.map((mode) => mode.label)).toEqual(["Shows", "Films"]);
    expect(CONTEXT).toMatch(/_Avoid_:.*\bmovie\b/);
  });

  it("groups films under the glossary's own three words", () => {
    for (const heading of ["Watchlist", "Finished", "Abandoned"]) {
      expect(FILM_GROUPS).toContain(`heading: "${heading}"`);
    }

    // The avoid-words the reference uses for two of those three.
    expect(FILM_GROUPS).not.toContain("Plan to Watch");
    expect(FILM_GROUPS).not.toContain("Completed");
  });

  /**
   * The three groups are the three states a film can be in — `CONTEXT.md`: *a film is only
   * ever on your watchlist, finished, or abandoned*. Asserted against `LIBRARY_STATES`
   * rather than a literal list, so a sixth state added to the glossary and the database
   * fails here instead of being quietly missing from Films mode.
   */
  it("covers every state a film can reach, and no state it cannot", () => {
    const grouped = [...FILM_GROUPS.matchAll(/state: "([a-z_]+)"/g)].map((m) => m[1]);

    expect(grouped).toEqual(["watchlist", "finished", "abandoned"]);
    for (const state of grouped) expect(LIBRARY_STATES).toContain(state);

    // Watching and caught up describe being part-way through a run of episodes, which is
    // not a thing a film can be. A chip for either would be a control that can never match.
    expect(grouped).not.toContain("watching");
    expect(grouped).not.toContain("caught_up");
  });
});

describe("the mode's shape", () => {
  it("opens on shows", () => {
    expect(DEFAULT_KIND_MODE).toBe("show");
    expect(KIND_MODES[0]?.value).toBe("show");
  });

  /**
   * The chips are hidden in Films mode, and this is the assertion that keeps them hidden.
   *
   * Two of the six can never match a film, so leaving them in would put controls on screen
   * that lie about what the library can contain. The rendering is a one-line condition and
   * nothing else in the suite would notice it going.
   */
  it("draws the state chips in Shows mode only", () => {
    expect(SURFACE).toMatch(/mode === "show" \? <LibraryChips/);
  });

  /**
   * The order of the three empty states, which is the order of the questions.
   *
   * A reader with no films has not filtered anything, so *nothing under that filter* — and
   * its *Clear the filter* button — would be an answer to a question they never asked.
   * Reversing these two branches type-checks, renders, and is wrong.
   */
  it("asks whether there is anything of this kind before asking about the filter", () => {
    const kindEmpty = SURFACE.indexOf("ofThisKind.length === 0");
    const filterEmpty = SURFACE.indexOf("visible.length === 0");

    expect(kindEmpty).toBeGreaterThan(-1);
    expect(filterEmpty).toBeGreaterThan(-1);
    expect(kindEmpty).toBeLessThan(filterEmpty);
  });

  /**
   * `DESIGN.md` §0: one accent per screen, and *the selected tab deliberately is not* it.
   * The reference draws this control's thumb in its accent colour, and the library already
   * spends its accent on the Watching chip's live label.
   */
  it("fills the selected segment with ink, not the accent", () => {
    expect(KIND_MODE_CONTROL).toContain("bg-ink");
    expect(KIND_MODE_CONTROL).not.toContain("bg-accent");
  });
});

describe("a poster with no artwork", () => {
  /**
   * The fallback fires on a bare `name`, and a bare `name` in a browser is `window.name` —
   * an empty string. So a `Poster` that destructured `posterPath` and not `name` renders
   * no initials, throws nothing, logs nothing, and looks exactly like the old behaviour.
   * That bug shipped as far as a browser during this change and only a render caught it.
   */
  it("is keyed off the prop and not a global", () => {
    const poster = code("app/poster.tsx");
    expect(poster).toMatch(/export function Poster\(\{\s*\n\s*posterPath,\s*\n\s*name,/);
  });

  it("takes up to three initials, in the title's own order", () => {
    expect(initialsOf("The Great Pottery Throw Down")).toBe("TGP");
    expect(initialsOf("Severance")).toBe("S");
    expect(initialsOf("Person of Interest")).toBe("POI");
  });

  /** Articles are kept: this is a visual key, not a sort key. */
  it("keeps the article, unlike a sort", () => {
    expect(initialsOf("The Bear")).toBe("TB");
  });

  /** Leading punctuation is skipped rather than drawn. */
  it("reads through punctuation to the first letter", () => {
    expect(initialsOf("…And the Bag's in the River")).toBe("ATB");
  });

  /** A name with nothing alphanumeric gives nothing, and the caller draws its rectangle. */
  it("gives nothing back when there is no letter to take", () => {
    expect(initialsOf("!!!")).toBe("");
  });
});
