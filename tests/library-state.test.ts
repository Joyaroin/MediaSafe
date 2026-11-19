import { describe, expect, it } from "vitest";

import { stateLabel } from "@/app/(signed-in)/library/library-state";
import type { LibraryState } from "@/db/access";

/**
 * Issue #555 — the state's word depends on the title's kind. A show that has not been
 * started is *Not started*; a film that has not been watched is *To watch*. The database
 * values (`caught_up`, `watchlist`, …) do not change; only what the UI prints does.
 */
describe("stateLabel", () => {
  it("says each state in a show's words", () => {
    expect(stateLabel("show", "watching")).toBe("Watching");
    expect(stateLabel("show", "watchlist")).toBe("Not started");
    expect(stateLabel("show", "caught_up")).toBe("Waiting for new episodes");
    expect(stateLabel("show", "finished")).toBe("Finished");
    expect(stateLabel("show", "abandoned")).toBe("Dropped");
  });

  it("says each state in a film's words", () => {
    expect(stateLabel("film", "watchlist")).toBe("To watch");
    expect(stateLabel("film", "finished")).toBe("Watched");
    expect(stateLabel("film", "abandoned")).toBe("Dropped");
    // A film is never partly watched or caught up, but the type allows both; they keep
    // the show's words rather than throwing on a state the view does not produce for films.
    expect(stateLabel("film", "watching")).toBe("Watching");
    expect(stateLabel("film", "caught_up")).toBe("Waiting for new episodes");
  });

  it("never prints Caught up, and never prints Watchlist, for either kind", () => {
    const states: readonly LibraryState[] = [
      "watching",
      "caught_up",
      "finished",
      "watchlist",
      "abandoned",
    ];
    for (const kind of ["show", "film"] as const) {
      for (const state of states) {
        const label = stateLabel(kind, state);
        expect(label).not.toMatch(/caught up/i);
        expect(label).not.toMatch(/watchlist/i);
      }
    }
  });
});
