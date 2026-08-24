import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #195, *The underline goes*. Fourteen controls were underlined prose wearing a
 * link's clothes — six of them already `<button>` elements, eight of them navigation — and
 * the complaint was visual, not semantic: nothing on screen read as pressable. Every one of
 * them now carries `GHOST_RECOVERY` instead, the same accent-ghost register `New list` and
 * `Import a library ›` already used, reused here knowingly ahead of the ticket `DESIGN.md`
 * §12 owes to settle what the accent means (`DESIGN.md`, this section, records that too).
 *
 * Two audits, matching the parent ticket's (#194) Testing Decisions section directly:
 *
 *  1. **No underlined text affordance survives under `app/`.** A repo-wide source scan, not
 *     a fixed file list — the fixed list is exactly what let this drift to fourteen in the
 *     first place. One file is named exempt below, with its own reason.
 *  2. **Element type held constant.** The seven controls that navigate are still `<Link>`;
 *     the seven that act are still `<button>`. Looking like a button and being one are
 *     different facts, and this ticket changed only the first.
 *
 *     Two of the acting seven were `abandon-control.tsx`'s *Give up on this* and *Take it
 *     back*, and they went when that control was retired. The count holds because the
 *     selection bar's two took their place — it had none in this table, and its *Add to
 *     list* is the ternary-labelled case `rendersAs` below is written to cope with.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * Several of the fourteen sit inside `programme-note-episodes.tsx` and `title-sheet.tsx`,
 * both downstream of components that import React's `ViewTransition` (#141), which the
 * installed React does not export outside a Next build — `tests/phone-groups-scroll.test.ts`
 * and `tests/remove-from-library-control.test.ts` hit the same wall and give the same
 * answer. A property about the whole source tree is the route-manifest audit's own shape
 * too, just over files instead of a build manifest — `readAppSourceFiles` is this file's
 * impure edge, the same role `readBuildArtifacts` plays there.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

/** Every `.ts`/`.tsx` file under `app/`, as a path relative to the repository root. */
function collectAppSourceFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        files.push(path.relative(REPOSITORY_ROOT, full));
      }
    }
  }

  walk(path.join(REPOSITORY_ROOT, "app"));
  return files;
}

/** The impure edge: real files under `app/`, read once per run. */
function readAppSourceFiles(): { readonly path: string; readonly source: string }[] {
  return collectAppSourceFiles().map((file) => ({ path: file, source: sourceAt(file) }));
}

/**
 * Comments discuss the word *underline* far more than code does — this file's own docblock
 * is proof, and `back-to-lists-bar.tsx` and `home-group.tsx` both narrate the conversion in
 * prose that would otherwise self-report as a violation. Stripped the same way
 * `phone-groups-scroll.test.ts` strips them before asking the same kind of question.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

function hasUnderlinedAffordance(source: string): boolean {
  return /\bunderline\b/.test(stripComments(source));
}

/**
 * **The one exemption, named.** `settings/delete-account/page.tsx`'s link to
 * `myaccount.google.com/permissions` is a citation inside a paragraph of explanatory prose
 * about a Google account, not a control on MediaSafe's own data — it already opens in a new
 * tab by its own `target="_blank"`, and the underlined-blue-link convention for an outbound
 * citation is not the thing the fourteen in-app controls were mistaken for buttons by being.
 * Named here, the way `route-manifest.test.ts`'s own `EXEMPT` is, so a second one has to be
 * argued for rather than added by widening a regular expression nobody reads.
 */
const EXEMPT = ["app/(signed-in)/settings/delete-account/page.tsx"];

/** The pure edge: given files as `{ path, source }` pairs, which are unexempted violations
 *  and which named exemptions no longer need to be one. */
function auditUnderlineUsage(
  files: readonly { readonly path: string; readonly source: string }[],
  exempt: readonly string[],
): { readonly violating: string[]; readonly staleExemptions: string[] } {
  const violating: string[] = [];
  const staleExemptions: string[] = [];

  for (const file of files) {
    const has = hasUnderlinedAffordance(file.source);
    if (exempt.includes(file.path)) {
      if (!has) staleExemptions.push(file.path);
    } else if (has) {
      violating.push(file.path);
    }
  }

  return { violating, staleExemptions };
}

describe("no underlined text affordance survives under app/", () => {
  it("finds none outside the one named exemption", () => {
    const audit = auditUnderlineUsage(readAppSourceFiles(), EXEMPT);

    // Two separate assertions, matching route-manifest.test.ts's own habit, so a failure
    // names which mistake was made rather than printing a diff of both at once.
    expect(audit.violating).toEqual([]);
    expect(audit.staleExemptions).toEqual([]);
  });

  it("is looking at a tree that has files in it", () => {
    // A floor, not a count — `DESIGN.md` §12 gives the reason a route or file count is
    // never written down: a number duplicated into a file with no reason to know it is
    // wrong by default. This only proves the walk did not silently return nothing.
    expect(collectAppSourceFiles().length).toBeGreaterThan(50);
  });
});

describe("the check can fail", () => {
  it("reports a file with a new underlined control", () => {
    const audit = auditUnderlineUsage(
      [{ path: "app/x.tsx", source: '<Link className="underline">Go</Link>' }],
      [],
    );

    expect(audit.violating).toEqual(["app/x.tsx"]);
  });

  it("ignores underline mentioned only in a comment", () => {
    const audit = auditUnderlineUsage(
      [{ path: "app/x.tsx", source: '// drop the underline\n<button type="button">Go</button>' }],
      [],
    );

    expect(audit.violating).toEqual([]);
  });

  it("reports an exemption that no longer needs to be one", () => {
    const audit = auditUnderlineUsage(
      [{ path: "app/x.tsx", source: '<button type="button">Go</button>' }],
      ["app/x.tsx"],
    );

    expect(audit.staleExemptions).toEqual(["app/x.tsx"]);
  });

  it("does not exempt a file's neighbour", () => {
    const audit = auditUnderlineUsage(
      [{ path: "app/y.tsx", source: '<Link className="underline">Go</Link>' }],
      ["app/x.tsx"],
    );

    expect(audit.violating).toEqual(["app/y.tsx"]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **The second audit.** Looking like a button and being one are different facts.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * `GHOST_RECOVERY` alone would let a `<Link>` and a `<button>` drift into looking identical
 * without saying anything about which either one *is* — that is exactly the distinction
 * issue #194's own words draw: *"element type is decided by what the control does, not by
 * how it looks."* This asks each of the fourteen by name.
 */

/** Whether `label`'s exact text renders as a child of a `tag` element in `source`. Anchored
 *  to the tag pair rather than searched positionally, because several of these files discuss
 *  their own control in a docblock before the JSX that renders it — a positional "nearest
 *  preceding tag" search would find the prose, not the element.
 *
 *  The gap between the opening tag's name and its closing `>` is `[\s\S]*?`, lazy and not
 *  excluding `>` — every one of these controls has an `onClick={() => ...}` among its
 *  attributes, and an arrow's own `>` would end a `[^>]*` class before the real tag close.
 *
 *  The gap around `label` itself excludes `<` rather than requiring pure whitespace —
 *  `selection-action-bar.tsx` renders its primary label from `{view.adding ? "Adding" :
 *  "Add to list"}`, not as bare text, and `[^<]` stays inside this one element's own
 *  children without being able to cross into a sibling or nested tag to find a false
 *  match. (The example was `abandon-control.tsx`'s `{shown ? "Take it back" : "Give up on
 *  this"}` until that control was retired; the shape it demonstrates is unchanged, and the
 *  bar's own entry in the table below is now the row that exercises it.) */
function rendersAs(source: string, tag: "button" | "Link", label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<${tag}[\\s\\S]*?>[^<]*?${escaped}[^<]*?<\\/${tag}>`).test(source);
}

const NAVIGATING_CONTROLS = [
  { file: "app/(signed-in)/settings/page.tsx", label: "Delete account ›" },
  {
    file: "app/(signed-in)/settings/delete-account/delete-account-frame.tsx",
    label: "‹ Back to Settings",
  },
  { file: "app/(signed-in)/lists/back-to-lists-bar.tsx", label: "‹ Lists" },
  {
    file: "app/(signed-in)/library/[entryId]/remove/remove-frame.tsx",
    label: "‹ Back to your library",
  },
  { file: "app/(signed-in)/library/remove-control.tsx", label: "Remove from library ›" },
  {
    file: "app/(signed-in)/library/[entryId]/remove/remove-title-form.tsx",
    label: "Open your library ›",
  },
  { file: "app/(signed-in)/library/[entryId]/back-to-library-bar.tsx", label: "‹ Library" },
] as const;

const ACTING_CONTROLS = [
  { file: "app/(signed-in)/lists/delete-list-dialog.tsx", label: "Cancel" },
  { file: "app/(signed-in)/library/programme-note-episodes.tsx", label: "Rewatch" },
  { file: "app/(signed-in)/library/programme-note-episodes.tsx", label: "Unwatch" },
  { file: "app/(signed-in)/lists/list-row.tsx", label: "Delete" },
  { file: "app/(signed-in)/library/add-to-list-control.tsx", label: "Add to list" },
  // The bulk bar's two, and the ternary-labelled case `rendersAs` above is written for.
  { file: "app/(signed-in)/library/selection-action-bar.tsx", label: "Add to list" },
  { file: "app/(signed-in)/library/selection-action-bar.tsx", label: "Done" },
] as const;

describe("the controls that navigate are still anchors", () => {
  for (const { file, label } of NAVIGATING_CONTROLS) {
    it(`"${label}" in ${file} is a Link, not a button`, () => {
      const source = sourceAt(file);

      expect(rendersAs(source, "Link", label)).toBe(true);
      expect(rendersAs(source, "button", label)).toBe(false);
    });
  }
});

describe("the controls that act are still buttons", () => {
  for (const { file, label } of ACTING_CONTROLS) {
    it(`"${label}" in ${file} is a button, not a Link`, () => {
      const source = sourceAt(file);

      expect(rendersAs(source, "button", label)).toBe(true);
      expect(rendersAs(source, "Link", label)).toBe(false);
    });
  }
});

describe("the element-type check can fail", () => {
  it("catches a navigating control turned into a button", () => {
    const source = '<button type="button">‹ Lists</button>';

    expect(rendersAs(source, "Link", "‹ Lists")).toBe(false);
    expect(rendersAs(source, "button", "‹ Lists")).toBe(true);
  });

  it("catches an acting control turned into a link", () => {
    const source = '<Link href="/lists">Cancel</Link>';

    expect(rendersAs(source, "button", "Cancel")).toBe(false);
    expect(rendersAs(source, "Link", "Cancel")).toBe(true);
  });

  it("does not match a label found only in prose above the element", () => {
    // The exact failure a positional "nearest preceding tag" search would have missed —
    // the label appears first in a docblock, then again as the real control's own text.
    const source = `
      /** The Cancel control, discussed here before it is built. */
      export function X() {
        return <button type="button">Dismiss</button>;
      }
    `;

    expect(rendersAs(source, "button", "Cancel")).toBe(false);
  });
});
