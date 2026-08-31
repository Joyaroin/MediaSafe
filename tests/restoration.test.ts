import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOTHING_REMEMBERED,
  SEARCH_START,
  UP_NEXT_START,
  railOffset,
  rememberSearch,
  rememberUpNext,
  searchPlace,
  upNextPlace,
  withPage,
  withRailOffset,
  type SearchPlace,
  type UpNextPlace,
} from "@/app/restoration";

/**
 * Where the reader was, driven directly — issue #276's *the restoration module is pure:
 * state in, state out, no DOM*.
 *
 * `vitest.config.mts` runs in `node`, so there is no rail to scroll here and there is not
 * meant to be. Everything below is a record going in and coming back out, which is exactly
 * why it was pulled out of the three surfaces that bind it: `tests/gesture-rules.test.ts`
 * is the prior art named by the spec, and it exists for the same reason — a rule that only
 * lives inside a scroll handler is a rule nothing can assert.
 *
 * The ticket names what is worth covering: **what is remembered round-trips**, and **a
 * surface never seen restores to its default rather than to nothing**. Both are here, and
 * so is the property that would otherwise fail most quietly — that remembering one surface
 * does not disturb the other, and that nothing here mutates what it was handed.
 */

/** A result, standing in for search's own. The module is generic over what a result is on
 *  purpose: it remembers a list and never reads inside one. */
interface StandInResult {
  readonly id: number;
  readonly name: string;
}

const FARGO: StandInResult = { id: 275, name: "Fargo" };
const SEVERANCE: StandInResult = { id: 95396, name: "Severance" };

const WHERE_UP_NEXT_WAS: UpNextPlace = {
  page: 1,
  rails: { Ongoing: 482, "Coming back": 0, "Old friends": 1140 },
};

const WHERE_SEARCH_WAS: SearchPlace<StandInResult> = {
  mode: "film",
  query: "fargo",
  results: [FARGO, SEVERANCE],
};

describe("a surface never seen restores to its default", () => {
  /**
   * The half of this module a threshold has no counterpart for. A reader who has never
   * opened Up next has no page and no offsets, and the honest answer to *where were they*
   * is **the top of page one** rather than `undefined` — which the pager would then have
   * to have a second opinion about.
   */
  it("puts Up next on its first page with every rail at the start", () => {
    expect(upNextPlace(NOTHING_REMEMBERED)).toEqual(UP_NEXT_START);
    expect(upNextPlace(NOTHING_REMEMBERED).page).toBe(0);
    expect(railOffset(upNextPlace(NOTHING_REMEMBERED), "Ongoing")).toBe(0);
  });

  it("puts search back in its resting state, with nothing typed and nothing found", () => {
    expect(searchPlace<StandInResult>(NOTHING_REMEMBERED)).toEqual(SEARCH_START);
    expect(searchPlace<StandInResult>(NOTHING_REMEMBERED).query).toBe("");
    expect(searchPlace<StandInResult>(NOTHING_REMEMBERED).results).toEqual([]);
  });

  /** A rail that has never been scrolled is at its start, on a surface that *has* been
   *  seen — the case a bare `?? UP_NEXT_START` gets wrong. */
  it("puts a rail nobody has scrolled at the start of a remembered surface", () => {
    const memory = rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS);
    expect(railOffset(upNextPlace(memory), "Films to watch")).toBe(0);
  });
});

describe("what is remembered round-trips", () => {
  it("hands Up next back exactly what it was given", () => {
    const memory = rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS);
    expect(upNextPlace(memory)).toEqual(WHERE_UP_NEXT_WAS);
  });

  it("hands each rail its own offset back", () => {
    const place = upNextPlace(rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS));
    expect(railOffset(place, "Ongoing")).toBe(482);
    expect(railOffset(place, "Coming back")).toBe(0);
    expect(railOffset(place, "Old friends")).toBe(1140);
  });

  /** The pager page is the ticket's *coming back from a title found on Upcoming does not
   *  dump the reader on Up next*. */
  it("hands the pager back the page the reader was on", () => {
    const memory = rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS);
    expect(upNextPlace(memory).page).toBe(1);
  });

  it("hands search back its query and its results, unre-fetched", () => {
    const memory = rememberSearch(NOTHING_REMEMBERED, WHERE_SEARCH_WAS);
    expect(searchPlace(memory)).toEqual(WHERE_SEARCH_WAS);
    expect(searchPlace(memory).results).toEqual([FARGO, SEVERANCE]);
  });

  /** The mode goes with them. Results for *Fargo the film* under a control saying *Shows*
   *  would be the pair restored apart. */
  it("hands search back the mode its results were found under", () => {
    const memory = rememberSearch(NOTHING_REMEMBERED, WHERE_SEARCH_WAS);
    expect(searchPlace(memory).mode).toBe("film");
  });

  it("remembers the last place rather than the first", () => {
    const memory = rememberUpNext(
      rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS),
      { page: 0, rails: { Ongoing: 12 } },
    );
    expect(upNextPlace(memory)).toEqual({ page: 0, rails: { Ongoing: 12 } });
  });
});

describe("the two surfaces are remembered apart", () => {
  it("leaves search at its default when only Up next has been seen", () => {
    const memory = rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS);
    expect(searchPlace<StandInResult>(memory)).toEqual(SEARCH_START);
  });

  it("leaves Up next at its default when only search has been seen", () => {
    const memory = rememberSearch(NOTHING_REMEMBERED, WHERE_SEARCH_WAS);
    expect(upNextPlace(memory)).toEqual(UP_NEXT_START);
  });

  it("keeps both once both have been seen", () => {
    const memory = rememberSearch(
      rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS),
      WHERE_SEARCH_WAS,
    );
    expect(upNextPlace(memory)).toEqual(WHERE_UP_NEXT_WAS);
    expect(searchPlace(memory)).toEqual(WHERE_SEARCH_WAS);
  });
});

describe("one rail, and one page, changed at a time", () => {
  /**
   * A rail records its own offset as it is scrolled, and there are five of them across
   * two devices. A whole-place write from each would be four rails overwritten with
   * whatever the fifth last saw.
   */
  it("moves the rail it was asked about and leaves the others alone", () => {
    const place = withRailOffset(WHERE_UP_NEXT_WAS, "Ongoing", 900);
    expect(railOffset(place, "Ongoing")).toBe(900);
    expect(railOffset(place, "Old friends")).toBe(1140);
    expect(place.page).toBe(1);
  });

  it("records a rail it has not seen before without losing the ones it has", () => {
    const place = withRailOffset(WHERE_UP_NEXT_WAS, "Films to watch", 64);
    expect(railOffset(place, "Films to watch")).toBe(64);
    expect(railOffset(place, "Ongoing")).toBe(482);
  });

  it("changes the page and leaves every offset where it was", () => {
    const place = withPage(WHERE_UP_NEXT_WAS, 0);
    expect(place.page).toBe(0);
    expect(place.rails).toEqual(WHERE_UP_NEXT_WAS.rails);
  });
});

describe("nothing here is changed in place", () => {
  /**
   * State in, state out. The memory is handed around between a pager, three rails and a
   * search field; a function that edited its argument would let one of them change what
   * another was holding.
   */
  it("leaves the memory it was given untouched", () => {
    const memory = rememberUpNext(NOTHING_REMEMBERED, WHERE_UP_NEXT_WAS);
    rememberSearch(memory, WHERE_SEARCH_WAS);
    expect(searchPlace<StandInResult>(memory)).toEqual(SEARCH_START);
    expect(NOTHING_REMEMBERED).toEqual({});
  });

  it("leaves the place it was given untouched", () => {
    withRailOffset(WHERE_UP_NEXT_WAS, "Ongoing", 900);
    withPage(WHERE_UP_NEXT_WAS, 0);
    expect(WHERE_UP_NEXT_WAS).toEqual({
      page: 1,
      rails: { Ongoing: 482, "Coming back": 0, "Old friends": 1140 },
    });
  });
});

/**
 * **Session-scoped, and that is a property of where the memory is kept.**
 *
 * The module above is pure and holds nothing; `app/restoration-memory.ts` is the one
 * variable it is threaded through, and it is a variable in the client bundle. That is what
 * makes #276's *it does not survive an app restart* true — a reload evaluates the module
 * again and the memory is empty.
 *
 * Asserted by reading the file, in the style of `tests/palette.test.ts`, because the way
 * this would break is somebody reaching for `sessionStorage` to make it *better* and
 * quietly giving the reader back a place they left two days ago.
 */
describe("the memory is session-scoped", () => {
  /** The file's code, with its comments taken out — the docblock there names the two
   *  stores it deliberately does not use, and a check that could not tell an argument
   *  against something from a use of it would forbid writing the argument down. */
  const memoryCode = readFileSync(
    path.join(import.meta.dirname, "..", "app", "restoration-memory.ts"),
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
