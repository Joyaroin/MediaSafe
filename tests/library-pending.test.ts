import { existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EmptyLibrary } from "@/app/(signed-in)/library/empty-library";
import LibraryLoading from "@/app/(signed-in)/library/loading";
import { SortSelectFace } from "@/app/(signed-in)/library/library-filter-bar";
import { ProgrammeNoteEpisodes } from "@/app/(signed-in)/library/programme-note-episodes";
import TitleDetailLoading from "@/app/(signed-in)/titles/[entryId]/loading";
import RemoveTitleLoading from "@/app/(signed-in)/titles/[entryId]/remove/loading";
import { PendingLine } from "@/app/pending-line";
import { ReadFailure } from "@/errors/read-failure";

/**
 * **Pending is a third state, and the whole risk is that it stops being one.**
 *
 * `AGENTS.md` opens on the pair `tvtracker` collapsed — a failed read that rendered as an
 * empty library, for the life of that app. The pending rules add the third and separate all
 * three by placement *and* weight. Every separation named is structural, which is
 * exactly the kind a later edit can erase without breaking anything: centre the dim line
 * and it reads as the empty library, give it a rule and it reads as the failure, and the
 * suite stays green through both.
 *
 * So the assertions here are about the differences rather than about the strings. Nothing
 * below asserts heading copy that `tests/library-surface.test.ts` already owns.
 */

const markupOf = (element: React.ReactElement) => renderToStaticMarkup(element);

describe("the pending line is the settled treatment", () => {
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

  /**
   * Three placeholder lines, and §9's own word still said to a screen reader.
   *
   * §9's *there is no skeleton* is reversed — `app/pending-line.tsx` carries the argument
   * and answers each of the four reasons rather than waiving them. The two that are
   * assertable here are reason 1 and reason 2, and they are asserted below.
   */
  it("draws placeholder lines, and still says Reading to a screen reader", () => {
    expect(pending).toContain('class="pending"');
    expect(pending.match(/pending-bar/g)!.length).toBeGreaterThan(0);
    expect(pending).toContain("sr-only");
    expect(pending).toContain("Reading");
  });

  /**
   * **Reason 2, which is the one that bites.** A grey block at a poster's measure is
   * pixel-identical to a title TMDB has no artwork for — `AGENTS.md`'s own lie in a new
   * spelling. Lines cannot be mistaken for artwork, so nothing here draws a poster's well
   * or its ratio.
   */
  it("draws no block anything could mistake for a missing poster", () => {
    expect(pending).not.toContain("poster");
    expect(pending).not.toContain("aspect-");
    expect(pending).not.toContain("still");
  });

  /**
   * **Reason 1: a skeleton is a count** — answered since the UI overhaul by the route
   * drawing one screen of its own layout (`app/skeleton.tsx`). The boundary takes no props,
   * so nothing about the data can reach how many cells it draws: one screen, always.
   */
  it("draws one screen of the grid it becomes, whatever the library holds", () => {
    expect(LibraryLoading.length).toBe(0);
    const boundary = markupOf(createElement(LibraryLoading));
    expect(boundary.match(/aspect-\[2\/3\]/g)).toHaveLength(12);
    expect(boundary).toContain('role="status"');
    expect(boundary).toContain("Reading");
  });

  it("gives an unclassified caller the smallest treatment, not the largest", () => {
    // §9's radius 2 and 4 — a region or one entry pending beside rendered content. A
    // default that drew a whole screen's worth would be a placeholder bigger than the
    // thing it stands in.
    const bare = markupOf(createElement(PendingLine));
    expect(bare.match(/pending-bar/g)).toHaveLength(1);
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
  /**
   * **Reason 3, answered rather than waived.** §9 ruled out a shimmer because a block that
   * reads as pending *because it pulses* has nothing left when the pulse is dropped. The
   * breathe here is opacity on bars that are themselves the signal, so reduced motion
   * takes the movement and leaves the meaning — `globals.css` settles them at the
   * midpoint rather than at full strength.
   */
  it("keeps its meaning when the movement is taken away", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const reduced = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    )!.join("\n");
    expect(reduced).toContain("pending-bar");
    expect(reduced).toMatch(/animation:\s*none/);
    // The bars stay drawn — a reduced-motion reader still sees a pending region.
    expect(pending.match(/pending-bar/g)!.length).toBeGreaterThan(0);
    // And nothing here is a sweeping gradient, which is what has no fallback.
    expect(pending).not.toContain("stagger-rise");
    expect(pending).not.toContain("sweep");
  });
});

/**
 * ── Held, before it ever paints — issue #301 ────────────────────────────────────────
 *
 * Radius 1 only: a whole route's own pending state waits behind
 * `--dur-pending-hold`. What belongs here is `PendingLine`'s own half of the
 * contract — the prop that turns the class on, and nothing else about the render.
 */
describe("the held prop, and only the held prop, gates the hold", () => {
  it("carries no hold class by default", () => {
    const bare = markupOf(createElement(PendingLine));
    expect(bare).toContain('class="pending"');
    expect(bare).not.toContain("route-pending-hold");
  });

  it("adds the hold class when told to, without losing the plain one", () => {
    const held = markupOf(createElement(PendingLine, { held: true }));
    expect(held).toContain('class="pending route-pending-hold"');
  });

  it("changes nothing else about the render", () => {
    // Same bars, same word, same role — the hold is a class on the wrapper and nothing
    // about what §9's treatment actually draws.
    const bare = markupOf(createElement(PendingLine, { shape: "form" }));
    const held = markupOf(createElement(PendingLine, { shape: "form", held: true }));
    expect(held.replace(' route-pending-hold', '')).toEqual(bare);
  });

  /**
   * The library boundary is this ticket's own worked example: §9 radius 1, and one of
   * the ten `loading.tsx` files converted. `tests/palette.test.ts` sweeps all ten by
   * source; this is the one rendered here already, checked for the actual markup rather
   * than for the prop being passed.
   */
  it("holds the library's own boundary, which is a route-level render", () => {
    const boundary = markupOf(createElement(LibraryLoading));
    expect(boundary).toContain("route-pending-hold");
  });

  /**
   * The episode region is radius 2 — beside content (`programme-note-episodes.tsx`)
   * that has already rendered — and must keep painting immediately. The rule is
   * explicit that a delayed region there is a blank gap, not a read in progress.
   */
  it("does not hold the episode region, which is beside content that already rendered", () => {
    const region = markupOf(
      createElement(ProgrammeNoteEpisodes, {
        kind: "show",
        episodes: [],
        libraryEntryId: "entry-1",
        titleName: "Andor",
      today: "2026-09-23",
        episodesPending: true,
      }),
    );
    expect(region).not.toContain("route-pending-hold");
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
  it("is not framed, which is what would make it read as empty", () => {
    // Charcoal (issue #397): the empty library is the outlined panel now, where it used to
    // be centred. The panel is the thing a pending library must not wear.
    expect(empty).toContain("hair-line");
    expect(pending).not.toContain("hair-line");
  });

  /** The empty state's headline, prose and button are three things pending does not have. */
  it("makes no assertion and offers no action", () => {
    expect(empty).toContain("Your library is empty");
    expect(pending).not.toContain("Your library is empty");
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
    expect(pending).toContain(">Library<");
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
      today: "2026-09-23",
        episodesPending,
      }),
    );

  const pending = region(true);
  const empty = region(false);

  it("does not tell a reader the show has no episodes while they are still arriving", () => {
    expect(empty).toContain("No episode data yet");
    expect(pending).not.toContain("No episode data yet");
  });

  it("draws the pending treatment, and draws it politely", () => {
    expect(pending).toContain('role="status"');
    expect(pending).not.toContain('role="alert"');
    expect(pending).toContain('class="pending"');
    expect(pending).toContain("Reading");
  });

  /**
   * §9's four reasons, held here as they are held for the line itself: no skeleton, no
   * shimmer, and no accent. A season list is precisely the shape a builder would reach for
   * a skeleton of — twelve grey rows — and §9's first reason is that twelve grey rows are a
   * count of something nobody knows yet.
   */
  it("draws no row-shaped skeleton, no shimmer and no accent", () => {
    // A season list is precisely the shape a builder would reach for a skeleton of, and
    // §9's first reason is that twelve grey rows are a count of something nobody knows
    // yet. This region draws the default — one bar — so it never becomes one.
    expect(pending.match(/pending-bar/g)).toHaveLength(1);
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
    expect(detail).not.toContain(">Library<");
    // The back bar, which since #292 names the surface the reader arrived from rather
    // than the library. This render has no previous pathname — nothing has navigated —
    // so what it draws is the stated fallback, and the property held here is unchanged:
    // the pending render carries a way out and no heading of its own. Round and over the
    // band since Charcoal (#403), so it is named for assistive technology.
    expect(detail).toContain('aria-label="Back to Tonight"');
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
 * *The boundary belongs to the page's own segment, never to the shell.*
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

/**
 * ── What replaces a pending region arrives, and the pending region does not ──────────
 *
 * A panel that swaps and an episode list that fills in used to appear by simply being
 * there on the next frame. `arrive` gives them the entrance every row in the application
 * already has — `rise-in`, the same 8px and the same curve, so a panel settling and a
 * library cell settling read as the same hand.
 *
 * The asymmetry is the property worth holding: **the content arrives and the placeholder
 * does not.** A placeholder that rises in makes the wait itself an event, which is what
 * §9's quiet is against, and a failure that slides into place reads as a notification
 * rather than as a region reporting what happened to it.
 */
describe("what replaces a pending region arrives", () => {
  const CSS = readFileSync("app/globals.css", "utf8");
  const EPISODES = readFileSync(
    "app/(signed-in)/library/programme-note-episodes.tsx",
    "utf8",
  );
  const FACTS = readFileSync("app/(signed-in)/library/live-title-facts.tsx", "utf8");
  const PANEL = readFileSync("app/(signed-in)/library/programme-note-content.tsx", "utf8");

  it("reuses the entrance every row already has rather than inventing a second", () => {
    const arrive = CSS.match(/@utility arrive \{[^}]*\}/)![0];
    expect(arrive).toContain("rise-in");
    expect(arrive).toContain("var(--ease-press)");
    // `backwards`, or the first frame is a flash of the final state before it animates.
    expect(arrive).toContain("backwards");
  });

  it("gives the panel and the episode list an entrance", () => {
    // On what is around the hero poster and under it, not on the whole panel: the poster
    // is the morph's landing and must not fade and drop after it lands (UI overhaul).
    expect(PANEL).toContain("className={`arrive-panel mt-3 grid");
    expect(readFileSync("app/(signed-in)/library/title-hero.tsx", "utf8")).toContain(
      'className="arrive-panel flex min-w-0 flex-1 flex-col',
    );
    expect(EPISODES).toMatch(/className=\{`arrive \$\{PROGRAMME_NOTE_SECTION\}`\}/);
  });

  it("does not give one to the placeholder or to the failure", () => {
    // The pending branch of the episode list, and the two non-resolved branches of a
    // streamed fact section. If `arrive` ever appears on these, the wait and the error
    // start announcing themselves.
    // The pending branch draws the plain section class; the resolved ones interpolate
    // `arrive` in front of it. Asserting the plain form still exists is what catches the
    // day someone "tidies up" by giving every branch the same wrapper.
    expect(EPISODES).toContain("<div className={PROGRAMME_NOTE_SECTION}>");

    // The word appears in prose throughout these files, so this matches the *class* —
    // the only form that changes what renders.
    const usesArrive = (source: string) => /className=\{`arrive/.test(source);
    const placeholder = FACTS.slice(0, FACTS.indexOf('const content = render(phase.value)'));
    expect(usesArrive(placeholder)).toBe(false);
    // And the resolved branch below it does.
    expect(usesArrive(FACTS.slice(FACTS.indexOf("const content = render(phase.value)")))).toBe(
      true,
    );
  });

  it("stops moving for a reader who asked for reduced motion", () => {
    // By construction rather than by a second rule: `arrive` is `rise-in`, and `rise-in`
    // is already overridden to fade without travelling under reduced motion.
    const reduced = CSS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    )!.join("\n");
    expect(reduced).toContain("rise-in");
    expect(reduced).toMatch(/transform:\s*none/);
  });
});

/**
 * ── The sort control shows it is working — issue #452 ────────────────────────────────
 *
 * Today's bug is specific: a reader changes the sort, the control keeps rendering as if
 * nothing happened, and the new order only shows up when Postgres and the RSC round trip
 * finish — which on a slow connection reads as the tap being dropped. `SortSelect` fixes
 * that with `useTransition`, but `useTransition`'s own `isPending` cannot be driven from
 * here: this suite is `environment: "node"`, there is no DOM and no mounted router, and
 * nothing short of a browser actually starts a transition. So the split is the one
 * `use-arrived-once.ts` already names for the same reason — *the pure half and the
 * binding* — and `SortSelectFace` is the pure half: the render that answers "is it
 * working", taking `pending` as a plain prop instead of reading it off the hook.
 * `SortSelect` itself is the thin, untested-in-isolation wiring onto `useTransition` and
 * `router.push`, trusted rather than exercised here.
 */
describe("the sort control shows it is working", () => {
  const face = (pending: boolean) =>
    markupOf(
      createElement(SortSelectFace, {
        value: "title",
        pending,
        onChange: () => {},
      }),
    );

  const idle = face(false);
  const working = face(true);

  /**
   * The literal acceptance criterion: pending while pending, and — just as load-bearing —
   * **not otherwise**. A control that always looked busy would pass a test that only
   * checked the `true` side and would not acknowledge anything, because it would never
   * stop looking like it was still thinking.
   */
  it("renders its pending state while a transition is pending, and not otherwise", () => {
    expect(working).toContain('aria-busy="true"');
    expect(idle).not.toContain("aria-busy");
  });

  /**
   * `aria-busy` alone is not a visual cue — a sighted reader needs the control itself to
   * look different, which is what actually answers the tap.
   */
  it("dims while working", () => {
    expect(working).toContain(" opacity-60");
    expect(idle).not.toContain("opacity-60");
  });

  /**
   * The native `<select>` under the face is disabled while a sort is already on its way —
   * so a second tap mid-transition cannot queue a navigation behind the one already
   * running — and its cursor says so rather than the ordinary pointer.
   */
  it("disables the select underneath while working, and only then", () => {
    expect(working).toContain('disabled=""');
    expect(working).toContain("cursor-wait");
    expect(idle).not.toContain('disabled=""');
    expect(idle).toContain("cursor-pointer");
  });

  /**
   * Nothing about which order is current, or the four choices themselves, changes with
   * `pending` — only the face's own "is it working" signal does. A sort control that lost
   * its options or its current label while busy would be a second bug wearing this one's
   * fix.
   */
  it("changes nothing about the sort's own options while working", () => {
    const strip = (markup: string) =>
      markup
        .replace(' aria-busy="true"', "")
        .replace(" opacity-60", "")
        .replace(' disabled=""', "")
        // The leading space picks out the select's own `cursor-wait`, not the dead
        // `disabled:cursor-wait` the button base carries unconditionally (`IN_FLIGHT`)
        // and which never matches on a `<span>` that is never itself `:disabled`.
        .replace(" cursor-wait", " cursor-pointer");
    expect(strip(working)).toEqual(idle);
  });
});
