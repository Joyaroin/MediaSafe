import { existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TitleDetailLoading from "@/app/(signed-in)/library/[entryId]/loading";
import RemoveTitleLoading from "@/app/(signed-in)/library/[entryId]/remove/loading";
import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import LibraryLoading from "@/app/(signed-in)/library/loading";
import { PendingLine } from "@/app/pending-line";
import { ReadFailure } from "@/errors/read-failure";

/**
 * **Pending is a third state, and the whole risk is that it stops being one.**
 *
 * `AGENTS.md` opens on the pair `tvtracker` collapsed — a failed read that rendered as an
 * empty library, for the life of that app. `DESIGN.md` §9 adds the third and separates all
 * three by placement *and* weight. Every separation it names is structural, which is
 * exactly the kind a later edit can erase without breaking anything: centre the dim line
 * and it reads as the empty library, give it a rule and it reads as the failure, and the
 * suite stays green through both.
 *
 * So the assertions here are about the differences rather than about the strings. Nothing
 * below asserts heading copy that `tests/library-surface.test.ts` already owns.
 */

const markupOf = (element: React.ReactElement) => renderToStaticMarkup(element);

describe("the pending line is the treatment DESIGN.md §9 settled", () => {
  const pending = markupOf(createElement(PendingLine));

  /**
   * `status`, never `alert` — §9: a surface reading is a normal moment of this
   * application, not an event worth interrupting anyone for. The implicit
   * `aria-live="polite"` that `status` carries is the whole reason the role is here, so a
   * silent drop of the attribute is a real regression for a reader on a screen reader and
   * an invisible one for everybody else.
   */
  it("announces politely rather than interrupting", () => {
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain('role="alert"');
  });

  /** One `code-line` in `dim`, and §9's own word for it. */
  it("is one dim code line reading Reading", () => {
    expect(pending).toContain("code-line");
    expect(pending).toContain("text-dim");
    expect(pending).toContain("Reading");
  });

  /**
   * **The accent never appears in a pending state.** §3 rations `--accent` to a closed set
   * of meanings and §9 says in as many words that pending is not on that list and is not
   * being added to it. It is also the single strongest visual cue separating pending from
   * failed, since the failure is an `accent` rule over an `accent` headline.
   */
  it("never reaches for the accent", () => {
    expect(pending).not.toContain("accent");
  });

  /**
   * §9's table, read as a negation: pending is *one* dim line, and no rule, no headline,
   * no prose, no button and no reference id. A second element here is not a cosmetic
   * regression — it is the state acquiring weight it was defined not to have.
   */
  it("carries nothing but the line", () => {
    expect(pending).not.toContain("<button");
    expect(pending).not.toContain("<h1");
    expect(pending).not.toContain("<h2");
    expect(pending).not.toContain("border-t");
  });

  /**
   * §9 forbids the skeleton and the shimmer outright, with four independent reasons. The
   * fourth — *a shimmer has no reduced-motion path* — is why this is asserted here rather
   * than left to a reviewer's eye: an animated pending state degrades under
   * `prefers-reduced-motion` into a rendered title with no poster, which is §6's rule
   * (*the event always happens, only the animation is negotiable*) broken in the one place
   * where the animation **was** the event. A line of text is legible with every animation
   * in the application switched off, and it is legible because there is nothing to switch
   * off.
   */
  it("has nothing a reduced-motion setting could take away", () => {
    expect(pending).not.toContain("animate-");
    expect(pending).not.toContain("stagger-rise");
    expect(pending).not.toContain("sweep");
  });
});

describe("a pending library is not an empty one and not a failed one", () => {
  const pending = markupOf(createElement(LibraryLoading));
  const empty = markupOf(createElement(EmptyLibrary));
  const failed = markupOf(
    createElement(ReadFailure, { reference: "abc123", retry: () => {} }),
  );

  /**
   * The acceptance criterion in its literal form. Two states that render the same markup
   * are one state with two names, which is the defect `AGENTS.md` opens on.
   */
  it("does not render the same markup as the empty library", () => {
    expect(pending).not.toEqual(empty);
  });

  /**
   * §9's table: empty is **centred**, pending is **inline, left-aligned, where the content
   * will be**. Centring is named there as the specific thing that would make pending read
   * as the empty library, so it is the specific thing asserted against.
   */
  it("is not centred, which is what would make it read as empty", () => {
    expect(empty).toContain("text-center");
    expect(pending).not.toContain("text-center");
  });

  /** The empty state's headline, prose and button are three things pending does not have. */
  it("makes no assertion and offers no action", () => {
    expect(empty).toContain("The bill is blank");
    expect(pending).not.toContain("The bill is blank");
    expect(pending).not.toContain("<a");
  });

  /**
   * §9: pending shares failure's *placement* and neither treatment's *weight*. The
   * reference id is the sharpest of those — it is the one thing on the failure a reader is
   * meant to quote back, and printing one for a read that has not finished would be an id
   * for nothing.
   */
  it("has no reference id, which the failure does", () => {
    expect(failed).toContain("abc123");
    expect(pending).not.toContain("Reference");
  });

  /**
   * §9, radius 1: *`loading.tsx` renders what the segment's `error.tsx` already renders,
   * less the failure.* The heading is a literal in the source, not an answer to a query,
   * so it is not pending and does not wait — and rendering it is what makes the sentence
   * *the library, which is still reading* true rather than showing a bare line on a blank
   * page.
   */
  it("paints the library's own heading immediately", () => {
    expect(pending).toContain("The library");
    expect(pending).toContain('id="library-heading"');
  });
});

/**
 * The two routes under `/library` that Next's own inheritance would otherwise hand the
 * library's heading to.
 *
 * A `loading.tsx` wraps its segment **and every segment below it**, so the boundary added
 * for the grid is what `/library/[entryId]` and `/library/[entryId]/remove` would show
 * while they read — printing *The library* over a title's own page. §9 already answers
 * this shape: *whatever the segment's `error.tsx` renders above the failure*, which for a
 * route whose `<h1>` is the thing being waited for is the back link and no `<h1>` at all.
 */
describe("the routes below the library say which page is reading", () => {
  const detail = markupOf(createElement(TitleDetailLoading));
  const remove = markupOf(createElement(RemoveTitleLoading));

  it("does not print the library's heading over a title", () => {
    expect(detail).not.toContain("The library");
    expect(detail).toContain("‹ Library");
    expect(detail).toContain('role="status"');
  });

  /**
   * The remove page's heading is a literal too, so it renders — but what matters most here
   * is what is **not** below it. `remove/error.tsx` makes the argument in as many words: a
   * page that could not read a title's counts must not offer to destroy them. A page that
   * has not read them yet is the same page, and the guarantee is the same one — the
   * pending render has no form in it at all.
   */
  it("offers nothing to confirm while the counts are still being read", () => {
    expect(remove).toContain('role="status"');
    expect(remove).not.toContain("<form");
    expect(remove).not.toContain("<button");
  });
});

/**
 * **A reader is never trapped on a slow surface**, and this is where that stops being a
 * hope and becomes a property of where a file sits.
 *
 * `DESIGN.md` §9: *the boundary belongs to the page's own segment, never to the shell.*
 * `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar, so a
 * `loading.tsx` at that level — or at `app/` — would take the navigation down with the
 * surface for the whole read, and a reader who cannot leave a slow screen is worse off than
 * one watching a frozen one.
 *
 * It is asserted by absence because that is the only form the guarantee has: nothing in a
 * rendered boundary can show that the navigation above it is still mounted, and the file
 * that would break it is a file somebody adds rather than an edit to one of these. Both
 * levels are checked, since the root layout would take the masthead down too.
 */
describe("the navigation stays up while a surface reads", () => {
  const boundaryAt = (segment: string) =>
    existsSync(path.join(process.cwd(), "app", segment, "loading.tsx"));

  it("puts no boundary on the shell that holds the navigation", () => {
    expect(boundaryAt("(signed-in)")).toBe(false);
  });

  it("puts no boundary on the root layout either", () => {
    expect(boundaryAt("")).toBe(false);
  });
});
