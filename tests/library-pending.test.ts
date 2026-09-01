import { existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import LibraryLoading from "@/app/(signed-in)/library/loading";
import { ProgrammeNoteEpisodes } from "@/app/(signed-in)/library/programme-note-episodes";
import TitleDetailLoading from "@/app/(signed-in)/titles/[entryId]/loading";
import RemoveTitleLoading from "@/app/(signed-in)/titles/[entryId]/remove/loading";
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
 * **A title whose episodes have not mirrored is not a title with no episodes** — issue
 * #272, and the third collapse of the pair this file exists to keep apart.
 *
 * The episode region has drawn one sentence for two states since #58: *No episode data
 * yet*, for a show still waiting for its mirror and for a show TMDB genuinely lists nothing
 * for. Since #271 the row carries the difference, and this is the surface holding it.
 *
 * The direction of the lie is what makes it worth a test. A reader who has just added a
 * show and is told it has no episodes concludes the add did not work; nothing throws,
 * nothing is logged, and the sentence becomes true-looking again the moment the mirror
 * lands, so it never reproduces for anybody looking for it.
 */
describe("a title whose episodes have not mirrored reads as pending, not as empty", () => {
  const region = (episodesPending: boolean, kind: "show" | "film" = "show") =>
    markupOf(
      createElement(ProgrammeNoteEpisodes, {
        kind,
        episodes: [],
        libraryEntryId: "entry-1",
        titleName: "Andor",
        episodesPending,
      }),
    );

  const pending = region(true);
  const empty = region(false);

  it("does not tell a reader the show has no episodes while they are still arriving", () => {
    expect(empty).toContain("No episode data yet");
    expect(pending).not.toContain("No episode data yet");
  });

  it("draws DESIGN.md §9's line, and draws it politely", () => {
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain('role="alert"');
    expect(pending).toContain("code-line");
    expect(pending).toContain("text-dim");
    expect(pending).toContain("Reading");
  });

  /**
   * §9's four reasons, held here as they are held for the line itself: no skeleton, no
   * shimmer, and no accent. A season list is precisely the shape a builder would reach for
   * a skeleton of — twelve grey rows — and §9's first reason is that twelve grey rows are a
   * count of something nobody knows yet.
   */
  it("has no skeleton, no shimmer and no accent", () => {
    expect(pending).not.toContain("animate-");
    expect(pending).not.toContain("stagger-rise");
    expect(pending).not.toContain("accent");
    expect(pending).not.toContain("<button");
  });

  it("never draws a pending region for a film", () => {
    // A film has no episode region at all, so there is nothing here for a pending line to
    // stand in — and `getTitleDetail` never reports one as pending either.
    expect(region(true, "film")).toBe("");
  });
});

/**
 * The two routes that Next's own inheritance would otherwise hand the library's heading
 * to — **and since #290 moved them to `/titles/{entryId}` and `/titles/{entryId}/remove`,
 * would not.**
 *
 * A `loading.tsx` wraps its segment **and every segment below it**, so while these lived
 * under `/library/[entryId]` the boundary added for the grid is what they would have shown
 * while they read — printing *The library* over a title's own page. §9 already answers
 * that shape: *whatever the segment's `error.tsx` renders above the failure*, which for a
 * route whose `<h1>` is the thing being waited for is the back link and no `<h1>` at all.
 *
 * The move takes the inheritance away and the assertions stay, because what they hold is
 * not *the grid's boundary is not inherited* but **each of these two says which page is
 * reading**. That is the same property at the old address and the new one, and it is still
 * live between the pair: the remove confirmation sits under the title, so the title's
 * pending render is what it would inherit if its own boundary went missing.
 */
describe("the routes below a title say which page is reading", () => {
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
