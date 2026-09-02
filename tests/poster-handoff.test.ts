import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOTHING_CARRIED,
  carry,
  posterFor,
  type Carried,
} from "@/app/poster-handoff";

/**
 * What poster a title's own surface should show while it is still reading — issue #303.
 *
 * `restoration.ts` is the shape this follows, for the reason its own docblock gives: the
 * rule has to be assertable in `node`, with no DOM, no element access and no clock, so it
 * is pulled out of the two places that would otherwise carry it — the library grid's click
 * handler and the phone title route's pending frame — into a function that touches
 * neither.
 *
 * **What is remembered** is one title's poster path, carried across exactly one route
 * change. **What a surface should show** is that path, when the surface being asked about
 * is the title it was carried for. **What an unvisited surface falls back to** is nothing
 * at all — the same "never seen this session" default `restoration.ts`'s `UP_NEXT_START`
 * and `SEARCH_START` give a surface with no place to restore to, spelled here as `null`
 * rather than a placeholder, because the pending frame's own answer to "nothing carried"
 * is to render no poster, exactly as it always has.
 */

describe("an unvisited surface falls back to nothing", () => {
  it("shows nothing for a title nobody has carried a poster into", () => {
    expect(posterFor(NOTHING_CARRIED, "entry-1")).toBeNull();
  });
});

describe("what is remembered round-trips", () => {
  it("hands back the exact path it was given", () => {
    const carried = carry("entry-1", "/severance.jpg");

    expect(posterFor(carried, "entry-1")).toBe("/severance.jpg");
  });

  /**
   * A title TMDB has no artwork for is carried too — `null` is a real answer here, not
   * "nothing was carried". The pending frame still mounts `<Poster>` with it, which is
   * what tells a title with no artwork apart from one still loading (the acceptance
   * criterion the ticket states in those words).
   */
  it("carries a title with no artwork as a real, present answer", () => {
    const carried = carry("entry-1", null);

    expect(carried).not.toBeNull();
    expect(posterFor(carried, "entry-1")).toBeNull();
  });

  it("remembers the last title carried rather than the first", () => {
    const first = carry("entry-1", "/one.jpg");
    const second = carry("entry-2", "/two.jpg");

    expect(posterFor(second, "entry-1")).toBeNull();
    expect(posterFor(second, "entry-2")).toBe("/two.jpg");
    // The first carry is untouched by the second — `carry` returns a fresh value rather
    // than mutating anything it was handed.
    expect(posterFor(first, "entry-1")).toBe("/one.jpg");
  });
});

describe("a carried poster answers only the title it was carried for", () => {
  /**
   * The guard the module exists to make possible. Without it, a reader who reaches
   * `/titles/{id}` some way other than the click that carried a poster — the back button,
   * a bookmark, a second tab — would be shown a different title's artwork for the length
   * of the pending frame, which is a wrong poster rather than a missing one.
   */
  it("shows nothing when the route asks about a title that is not the one carried", () => {
    const carried = carry("entry-1", "/severance.jpg");

    expect(posterFor(carried, "entry-2")).toBeNull();
  });
});

describe("nothing here is changed in place", () => {
  it("leaves an earlier carry untouched by a later one", () => {
    const carried: Carried = carry("entry-1", "/severance.jpg");
    carry("entry-2", "/other.jpg");

    expect(posterFor(carried, "entry-1")).toBe("/severance.jpg");
  });
});

/**
 * **Session-scoped, and that is a property of where the carried poster is kept.**
 *
 * The module above is pure and holds nothing; `app/poster-handoff-memory.ts` is the one
 * variable it is threaded through, in the shape `restoration-memory.ts` already
 * establishes for exactly this reason — one module, a handful of lines, so that
 * *session-scoped* is a fact about one variable rather than a claim about a system.
 *
 * Asserted by reading the file, in `tests/restoration.test.ts`'s own manner: the way this
 * would break is somebody reaching for `sessionStorage` to make a reload survive, and
 * quietly handing a later title's pending frame a poster carried two navigations ago.
 */
describe("the carried poster is session-scoped", () => {
  const memoryCode = readFileSync(
    path.join(import.meta.dirname, "..", "app", "poster-handoff-memory.ts"),
    "utf8",
  )
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\/\/.*$/gm, "");

  it.each(["localStorage", "sessionStorage", "document.cookie", "indexedDB"])(
    "keeps nothing in %s",
    (store) => {
      expect(memoryCode).not.toContain(store);
    },
  );
});
