import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EPISODE_SYNOPSIS_ABSENT,
  LIVE_FACT_FAILURE,
} from "@/app/(signed-in)/library/live-fact-copy";

/**
 * **`No synopsis yet` and `this failed to load` are different sentences and must never
 * collapse into one** — issue #253 says that twice, once in its own words and once as an
 * acceptance criterion, and its ticket calls it *the exact failure `AGENTS.md` opens on*.
 *
 * `tvtracker` is the reason the rule exists: a failed read there returned `[]` and rendered
 * the empty library, so a database that was down and a library that was empty were the same
 * screen. `SPEC.md` §3.2 makes the two structurally separate in the data path,
 * `errors/read-failure.tsx` makes them separate on the glass, and this file is the third
 * place that separation has to hold — **in the words**, on the one surface where a
 * catalogue gap and a network failure land in the same region of the same page.
 *
 * ── Why the sentences are tested and not the rendered sections ───────────────────────
 *
 * Both are drawn by `live-title-facts.tsx`, whose import graph reaches
 * `title-detail-actions.ts` → `tmdb/catalogue.ts`, which is `import "server-only"` and
 * throws on import outside Next's own build. `tests/programme-note.test.ts` records the
 * same boundary and stops at the same line. That is exactly why `live-fact-copy.ts` exists:
 * it has no imports, so the two sentences are reachable here, and the component is left
 * holding markup rather than prose.
 *
 * The second half of this file closes the gap that leaves — a constant nothing renders is a
 * constant that can quietly stop being used — by reading the component's source and
 * checking that both branches still go through it.
 */

describe("the two things an empty synopsis section can mean", () => {
  /**
   * The criterion itself, in the plainest form it has: they are not the same string.
   *
   * Trivial to satisfy today and not trivial to keep. The way this fails is not somebody
   * typing one string twice — it is a later edit "simplifying" two nearly-empty states
   * into one shared *Nothing to show* and taking the distinction with it.
   */
  it("are two sentences, not one", () => {
    expect(EPISODE_SYNOPSIS_ABSENT).not.toBe(LIVE_FACT_FAILURE);
  });

  /**
   * And neither is a substring of the other, which is the version of the rule that
   * survives a rewrite. Equality alone would pass for *Nothing to show.* and *Nothing to
   * show. Try again.* — two sentences that a reader cannot tell apart at a glance, which
   * is what the criterion is actually about.
   */
  it("do not contain one another", () => {
    expect(LIVE_FACT_FAILURE).not.toContain(EPISODE_SYNOPSIS_ABSENT);
    expect(EPISODE_SYNOPSIS_ABSENT).not.toContain(LIVE_FACT_FAILURE);
  });

  /**
   * The empty state names **TMDB**, and says nothing about loading or failing.
   *
   * This is the one that would catch the realistic regression: copy edited towards
   * *Could not load a synopsis*, which reads as a failure, offers no *Try again* because
   * nothing failed, and is therefore the worst of both states.
   */
  it("say that TMDB has none, without saying that anything went wrong", () => {
    expect(EPISODE_SYNOPSIS_ABSENT).toContain("TMDB");
    for (const failureWord of ["load", "fail", "wrong", "error", "again"]) {
      expect(EPISODE_SYNOPSIS_ABSENT.toLowerCase()).not.toContain(failureWord);
    }
  });

  /**
   * And the failure state says something failed, without claiming the catalogue is empty.
   * *TMDB has nothing for this* over a request that timed out is the same lie `tvtracker`
   * told, one field down.
   */
  it("say that a read failed, without claiming the catalogue is empty", () => {
    expect(LIVE_FACT_FAILURE.toLowerCase()).toContain("did not load");
    expect(LIVE_FACT_FAILURE).not.toContain("TMDB");
  });

  /**
   * Neither carries a technical string. `SPEC.md` §6: every user-facing string is a plain
   * sentence — no status, no error code, no exception message — and *the one technical
   * string allowed anywhere is the reference id*, which is drawn beside the failure by
   * `ReferenceLine` rather than interpolated into it. A digit appearing in either of these
   * is the first sign of an HTTP status having been let in.
   */
  it("carry no status, code or interpolation", () => {
    for (const sentence of [EPISODE_SYNOPSIS_ABSENT, LIVE_FACT_FAILURE]) {
      expect(sentence).not.toMatch(/\d/);
      expect(sentence).not.toContain("${");
    }
  });
});

/**
 * The constants are the ones actually rendered — the assertion that keeps the block above
 * from being a test of two strings nobody uses.
 *
 * Read off the source, for the reason the section header gives: the component cannot be
 * imported here at all. `tests/cache-tags.test.ts` reads `cache/`'s source for the same
 * kind of claim — *this module does this and no more* — and this is that habit applied to
 * a module a test may not load.
 */
describe("both branches go through the named sentences", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "app", "(signed-in)", "library", "live-title-facts.tsx"),
    "utf8",
  );

  it("renders each constant rather than prose written at the branch", () => {
    expect(source).toContain("{LIVE_FACT_FAILURE}");
    expect(source).toContain("{EPISODE_SYNOPSIS_ABSENT}");
  });

  /**
   * And neither sentence has been pasted back in beside the constant that replaced it —
   * the shape a half-finished revert leaves, where the constant is still imported and the
   * branch renders a copy of it that no longer has to agree.
   */
  it("does not also carry either sentence as a literal", () => {
    expect(source).not.toContain(EPISODE_SYNOPSIS_ABSENT);
    expect(source).not.toContain("This did not load.");
  });
});
