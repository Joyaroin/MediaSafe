import { describe, expect, it } from "vitest";

import { searchPhaseFor, groupByKind } from "@/app/(signed-in)/search/search-groups";
import type { MarkedResult } from "@/app/(signed-in)/search/actions";

/**
 * Issue #357 — one search field for films and shows. The field asks both catalogues at
 * once and the answer is drawn in two groups, Shows then Films. What decides what the
 * reader sees — a group, an empty state, a failure — is this module, driven directly.
 *
 * The rule that matters most is the error discipline's: a kind whose search failed is
 * never drawn as a kind with no matches, and a search that failed is never *Nothing by
 * that name*.
 */

function result(kind: "show" | "film", tmdbId: number, name = `Title ${tmdbId}`): MarkedResult {
  return {
    kind,
    tmdbId,
    name,
    releaseYear: 2022,
    posterPath: null,
    inLibrary: false,
  } as MarkedResult;
}

const found = (...results: MarkedResult[]) => ({ ok: true as const, results });
const failed = (reference: string | null) => ({ ok: false as const, reference });

describe("what a search shows", () => {
  it("draws Shows, then Films, each with its own results", () => {
    const phase = searchPhaseFor(
      { show: found(result("show", 1)), film: found(result("film", 2), result("film", 3)) },
      "severance",
    );

    expect(phase).toEqual({
      kind: "groups",
      groups: [
        { kind: "show", label: "Shows", state: { kind: "results", results: [result("show", 1)] } },
        {
          kind: "film",
          label: "Films",
          state: { kind: "results", results: [result("film", 2), result("film", 3)] },
        },
      ],
    });
  });

  it("leaves out a kind with no matches rather than drawing an empty group", () => {
    const phase = searchPhaseFor({ show: found(), film: found(result("film", 2)) }, "heat");

    expect(phase.kind).toBe("groups");
    expect(phase.kind === "groups" && phase.groups.map((group) => group.kind)).toEqual(["film"]);
  });

  it("says nothing matched only when both searches succeeded and found nothing", () => {
    expect(searchPhaseFor({ show: found(), film: found() }, "zzzz")).toEqual({
      kind: "empty",
      query: "zzzz",
    });
  });

  it("draws a failed kind as a failure beside the kind that succeeded", () => {
    const phase = searchPhaseFor(
      { show: failed("ref-1"), film: found(result("film", 2)) },
      "severance",
    );

    expect(phase).toEqual({
      kind: "groups",
      groups: [
        { kind: "show", label: "Shows", state: { kind: "failed", reference: "ref-1" } },
        { kind: "film", label: "Films", state: { kind: "results", results: [result("film", 2)] } },
      ],
    });
  });

  it("never reads a failed kind as a kind with nothing in it", () => {
    const phase = searchPhaseFor({ show: failed(null), film: found() }, "severance");

    expect(phase.kind).not.toBe("empty");
    expect(phase).toEqual({
      kind: "groups",
      groups: [{ kind: "show", label: "Shows", state: { kind: "failed", reference: null } }],
    });
  });

  it("is one failure when both searches failed", () => {
    expect(searchPhaseFor({ show: failed("ref-1"), film: failed("ref-2") }, "x")).toEqual({
      kind: "failed",
      reference: "ref-1",
    });
  });
});

describe("regrouping remembered results", () => {
  it("splits one list back into the two kinds, keeping each kind's order", () => {
    const results = [result("film", 2), result("show", 1), result("film", 3)];

    expect(groupByKind(results)).toEqual({
      show: found(result("show", 1)),
      film: found(result("film", 2), result("film", 3)),
    });
  });
});
