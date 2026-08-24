import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone's two rails — issue #250, replacing `tests/phone-groups-scroll.test.ts`, whose
 * five vertical groups this ticket deleted.
 *
 * Everything here is a property that would fail **silently** rather than on sight, which is
 * the line `SPEC.md` §6 draws around what earns a test:
 *
 *  1. **The next-episodes rail is all three orderings, in one sequence.** This is the
 *     ticket's own named failure and the reason it asks for Opus: get the concatenation
 *     wrong and *the rail still renders, still holds episodes, and quietly leaves the cold
 *     shows out*. `oldFriends` is *watching, everything not in ongoing* — 187 of the 199
 *     watching titles on the committed library — so a rail built from `ongoing` alone looks
 *     entirely correct to anybody who is not counting.
 *  2. **The tracks snap to the page gutter.** `snap-x snap-mandatory` on the track and
 *     `snap-start` on the card are two halves of one rule, and either alone silently does
 *     nothing. So is `scroll-pl-[22px]` against the track's own `px-[22px]`: drop it and
 *     the first card of every rail parks under the page gutter, which is exactly what the
 *     acceptance criterion forbids.
 *  3. **The five deleted surfaces are really gone**, rather than merely unlinked.
 *  4. **Empty and failed stay separate.** The surface that says *nothing queued for
 *     tonight* must never be reachable from a read that threw — this is the screen
 *     `AGENTS.md`'s rule was written about.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * `tests/phone-groups-scroll.test.ts`'s reason, unchanged and now broader: the episode card
 * is a client component over `useSyncExternalStore`, and `up-next/page.tsx` reaches
 * `db/access.ts`, which the `server-only` package makes throw on import outside Next's own
 * RSC bundler. Nothing on this surface renders in this harness. Reading the source is what
 * is left, and it is the same device `tests/remove-from-library-control.test.ts` uses for
 * facts about a surface rather than about a render.
 *
 * The behaviour that is *not* source-read is in `tests/up-next-card-mark.test.ts` (the
 * mark, the advance, the reversal and the arrived-empty rule, against a real store) and
 * `tests/up-next-episode-card-line.test.ts` (the four strings), both of which drive real
 * functions. This file covers only what is genuinely structural.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const UP_NEXT = "app/(signed-in)/up-next";
const PAGE = `${UP_NEXT}/page.tsx`;
const SURFACE = `${UP_NEXT}/up-next-rails.tsx`;
const RAIL_SECTION = `${UP_NEXT}/up-next-phone-rail.tsx`;
const EPISODE_RAIL = `${UP_NEXT}/up-next-episode-rail.tsx`;
const EPISODE_CARD = `${UP_NEXT}/up-next-episode-card.tsx`;
const FILM_RAIL = `${UP_NEXT}/up-next-film-rail.tsx`;
const NOTHING = `${UP_NEXT}/up-next-nothing.tsx`;

describe("the landing screen shows two rails and the five groups are gone", () => {
  it("renders the two rails under the phone's own breakpoint", () => {
    const page = sourceAt(PAGE);

    expect(page).toMatch(/<UpNextPhoneRails rails=\{rails\} films=\{films\} \/>/);
    // The gate is the page's, and it is a Tailwind fact rather than a server one — #136
    // deleted this build's only `matchMedia` branch deliberately.
    expect(page).toMatch(/className="lg:hidden"/);
  });

  it("draws the next-episodes rail and then the films rail, in that order", () => {
    const surface = sourceAt(SURFACE);
    const episodes = surface.indexOf("<UpNextEpisodeRail");
    const films = surface.indexOf("<UpNextFilmRail");

    expect(episodes).toBeGreaterThan(-1);
    expect(films).toBeGreaterThan(episodes);
  });

  /**
   * The deletion, asserted against the directory rather than against a list. A file left
   * behind is dead code that still compiles; the acceptance criterion is that the five
   * groups and the title sheet are gone, and this is what notices if one comes back.
   */
  it("has deleted the five group components and the title sheet", () => {
    const present = new Set(readdirSync(path.join(REPOSITORY_ROOT, UP_NEXT)));

    for (const gone of [
      "up-next-groups.tsx",
      "home-group.tsx",
      "group-screen.tsx",
      "group-tile.tsx",
      "ongoing-group.tsx",
      "ongoing-tile.tsx",
      "title-sheet.tsx",
      "title-sheet-context.ts",
    ]) {
      expect({ file: gone, present: present.has(gone) }).toEqual({
        file: gone,
        present: false,
      });
    }
  });

  it("has deleted the five expanded routes", () => {
    const present = readdirSync(path.join(REPOSITORY_ROOT, UP_NEXT), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(present).toEqual([]);
  });

  /**
   * The title sheet had no other caller, which is why it could be deleted at all. This is
   * the check that it left no **citations** behind — an import of a deleted module fails
   * the build, but a docblock naming one does not, and a comment citing a file that no
   * longer exists is the drift `CLAUDE.md` names by name.
   *
   * It matches a backticked path rather than the bare words, deliberately. Prose *about*
   * the deleted sheet is fine and sometimes necessary — `bulk-selection-context.ts` still
   * explains that it splits its context out for the reason that sheet's own context did,
   * which is true history and useful. What must not survive is a reference a reader could
   * follow, because that is the one that reads as a live file and is not one.
   */
  it("leaves no citation of the deleted title sheet anywhere in the app", () => {
    for (const file of sourceFiles(path.join(REPOSITORY_ROOT, "app"))) {
      const relative = path.relative(REPOSITORY_ROOT, file);
      const cites = /`[^`]*title-sheet[^`]*\.tsx?`/.test(readFileSync(file, "utf8"));
      expect({ file: relative, cites }).toEqual({ file: relative, cites: false });
    }
  });

  /** The same, for the five group components — the deletion is only complete when nothing
   *  still points a reader at them. */
  it("leaves no citation of the five deleted group components", () => {
    const gone = /`[^`]*(group-tile|home-group|group-screen|ongoing-tile|ongoing-group|up-next-groups)[^`]*\.tsx?`/;

    for (const file of sourceFiles(path.join(REPOSITORY_ROOT, "app"))) {
      const relative = path.relative(REPOSITORY_ROOT, file);
      const cites = gone.test(readFileSync(file, "utf8"));
      expect({ file: relative, cites }).toEqual({ file: relative, cites: false });
    }
  });
});

describe("the next-episodes rail is the three orderings concatenated", () => {
  const source = sourceAt(EPISODE_RAIL);

  /**
   * **The assertion this file exists for.** Ongoing, then coming back, then old friends —
   * the sequence the five deleted groups expressed structurally, now expressed as one line
   * of spread syntax that nothing else in the build would notice going wrong.
   */
  it("spreads ongoing, then comingBack, then oldFriends, in that order", () => {
    expect(source).toMatch(
      /\[\s*\.\.\.rails\.ongoing,\s*\.\.\.rails\.comingBack,\s*\.\.\.rails\.oldFriends,?\s*\]/,
    );
  });

  /**
   * **The concatenation is memoised, and that is correctness-adjacent rather than tuning.**
   *
   * `useEntriesOnRail` takes this array into a `useCallback` dependency and hands the
   * result to `useSyncExternalStore` as its `subscribe`. A fresh array per render is a
   * fresh `subscribe` per render, which React answers by unsubscribing and resubscribing
   * every listener — one per queued episode across the whole rail, on the order of eight
   * hundred here, on every render including the one a press causes.
   *
   * Nothing on screen looks wrong when this regresses, which is exactly why it is pinned:
   * the rail renders, the marks land, and the cost is invisible outside a profiler.
   */
  it("memoises the concatenation rather than rebuilding it each render", () => {
    expect(source).toMatch(/const entries = useMemo\(/);
    expect(source).toMatch(
      /\[rails\.ongoing,\s*rails\.comingBack,\s*rails\.oldFriends\],/,
    );
  });

  it("names all three, so none can be dropped without this failing", () => {
    for (const rail of ["rails.ongoing", "rails.comingBack", "rails.oldFriends"]) {
      expect({ rail, present: source.includes(rail) }).toEqual({ rail, present: true });
    }
  });

  /** The read keeps them apart so this file can put them in order. A read that had already
   *  flattened them would put the rule where no surface could see it. */
  it("leaves the read's three arrays as three", () => {
    const access = sourceAt("db/access.ts");
    expect(access).toMatch(/export interface UpNextRails \{[^}]*\bongoing\b/);
    expect(access).toMatch(/export interface UpNextRails \{[^}]*\bcomingBack\b/);
    expect(access).toMatch(/export interface UpNextRails \{[^}]*\boldFriends\b/);
  });
});

describe("both rails snap to the page gutter and leave the next card peeking", () => {
  const section = sourceAt(RAIL_SECTION);

  /**
   * The pairing, asserted as a pairing. `scroll-pl-[22px]` and the track's own `px-[22px]`
   * are load-bearing on each other — the first without the second snaps to a padding box
   * that is not there, and the second without the first parks every rail's first card
   * under the page gutter.
   */
  it("pairs the track's gutter with a matching scroll padding", () => {
    expect(section).toMatch(/scroll-pl-\[22px\]/);
    expect(section).toMatch(/px-\[22px\]/);
  });

  it("matches the page heading's gutter, which is what the page gutter means", () => {
    expect(sourceAt(`${UP_NEXT}/up-next-heading.tsx`)).toMatch(/px-\[22px\]/);
  });

  it("puts the mandatory snap on the track", () => {
    expect(section).toMatch(/snap-x snap-mandatory/);
  });

  /**
   * The track's half is useless without the card's. Both card kinds carry it, and asserting
   * each by file is what stops one of them being added later without it — a rail that
   * scrolled freely while the one beside it snapped is the kind of difference nobody
   * notices in a diff.
   */
  it.each([
    ["episode card", EPISODE_CARD],
    ["film card", FILM_RAIL],
  ])("puts snap-start on the %s", (_name, file) => {
    expect(sourceAt(file)).toMatch(/snap-start/);
  });

  /**
   * The overhang that says the rail continues. The track carries the gutter rather than the
   * `<section>` precisely so it can bleed to the viewport edges; a `<section>` with the
   * padding would clip the trailing card at the gutter instead of at the screen edge, and
   * nothing would peek.
   */
  it("puts the gutter on the track rather than on the section around it", () => {
    expect(section).toMatch(/<section className="pt-\[26px\]">/);
    expect(section).toMatch(/<ol className="[^"]*px-\[22px\]/);
  });

  it("hides the scrollbar without hiding that there is more", () => {
    expect(section).toMatch(/\[scrollbar-width:none\]/);
    expect(section).toMatch(/\[&::-webkit-scrollbar\]:hidden/);
  });
});

describe("the count is on the card and never on a rail head", () => {
  /**
   * `SPEC.md` §7's *no counts, anywhere* is **narrowed** by #250 rather than dropped: the
   * card gains the one number that tells a reader whether they are three from the end or
   * thirty, and the rail head keeps the rule. A numeral on a head would be the *showing 10
   * of 62* line with the words filed off.
   */
  it("puts the remaining count on the episode card", () => {
    expect(sourceAt(EPISODE_CARD)).toMatch(/remainingInWords\(remainingAfter\)/);
  });

  it("gives the rail heads plain labels with no numeral in them", () => {
    for (const [file, label] of [
      [EPISODE_RAIL, "Next episodes"],
      [FILM_RAIL, "Films to watch"],
    ]) {
      expect(sourceAt(file)).toContain(`<RailSection label="${label}">`);
      expect(label).not.toMatch(/\d/);
    }
  });

  /** No `More ›` either — the five screens it led to are gone, and a link whose presence
   *  tracked a group's size would be a count in disguise. The head is a label and nothing
   *  else, so the assertion is that the section renders no link at all. */
  it("offers no More link, because there is no longer anywhere for it to go", () => {
    const section = sourceAt(RAIL_SECTION);
    expect(section).not.toMatch(/<Link\b/);
    expect(section).not.toMatch(/from "next\/link"/);
  });

  /** SPEC records the narrowing, which is its own acceptance criterion. */
  it("has SPEC recording the narrowing rather than contradicting the build", () => {
    const spec = sourceAt("SPEC.md");
    expect(spec).toMatch(/No counts on a rail head/);
    expect(spec).toMatch(/#250/);
  });
});

describe("the films rail", () => {
  const source = sourceAt(FILM_RAIL);

  /** Both predicates live in the read, and both are predicates rather than slices. */
  it("is the entries standing at Watchlist whose title is a film", () => {
    const access = sourceAt("db/access.ts");
    expect(access).toMatch(/eq\(libraryEntryState\.state, "watchlist" satisfies LibraryState\)/);
    expect(access).toMatch(/eq\(title\.kind, "film" satisfies TitleKind\)/);
  });

  it("navigates to the title rather than opening anything over the screen", () => {
    expect(source).toMatch(/<Link href=\{`\/library\/\$\{film\.libraryEntryId\}`\}/);
  });

  /**
   * **No check.** The handoff draws one; #250 says *the mark is unchanged — no new marking
   * path*, and a film's watch is one row rather than a run of episodes, so a check here
   * would be a second marking path with its own optimism, rollback and toast.
   */
  it("carries no mark control of its own", () => {
    expect(source).not.toMatch(/useUpNextMark|WatchSweep|CheckmarkIcon|markFrom/);
  });

  /** A server component: no mark, no selection, no scroll state, so no bundle cost. */
  it("needs no client boundary", () => {
    expect(source).not.toMatch(/^"use client"/m);
  });
});

describe("empty and failed are never the same thing", () => {
  it("renders an empty rail as absent, with no heading over nothing", () => {
    expect(sourceAt(EPISODE_RAIL)).toMatch(/if \(showing\.length === 0\) return null;/);
    expect(sourceAt(FILM_RAIL)).toMatch(/if \(films\.length === 0\) return null;/);
  });

  /** A screen with nothing at all is a *different* fact from either rail being empty, and
   *  it gets the handoff's own sentence rather than a blank page. */
  it("gives a screen with nothing at all the handoff's sentence", () => {
    expect(sourceAt(SURFACE)).toMatch(/if \(noEpisodes && films\.length === 0\) return <UpNextNothing \/>;/);

    const nothing = sourceAt(NOTHING);
    expect(nothing).toContain("Nothing queued for tonight");
    expect(nothing).toContain("Add a show and its next episode turns up here.");
    expect(nothing).toContain("Search the catalogue");
  });

  /**
   * The two sentences answer two questions and must not be collapsed into one. The phone
   * asks *no next episode and no watchlist film*; the desktop asks *nothing watching and
   * nothing dated to come back*. `docs/design/v1-surfaces.md` §6: these read differently
   * and must not share copy.
   */
  it("keeps the phone's sentence and the desktop's distinct", () => {
    expect(sourceAt(NOTHING)).not.toContain("You&rsquo;re caught up");
    expect(sourceAt(`${UP_NEXT}/up-next-empty.tsx`)).not.toContain(
      "Nothing queued for tonight",
    );
  });

  /**
   * **The rule `AGENTS.md` bites hardest with, on the surface it was written about.** A
   * failed read must reach `error.tsx` and draw the read-failure treatment with a reference
   * id — never an empty rail, and never the sentence above. There is no `try` on the path,
   * which is what makes that structural rather than remembered.
   */
  it("routes a failed read to the inline treatment with a reference id", () => {
    const error = sourceAt(`${UP_NEXT}/error.tsx`);
    expect(error).toMatch(/referenceForBoundary\(error\)/);
    expect(error).toMatch(/<ReadFailure reference=\{reference\} retry=\{retry\} \/>/);
  });

  it("catches nothing anywhere on the read path", () => {
    for (const file of [PAGE, SURFACE, EPISODE_RAIL, FILM_RAIL]) {
      const relative = file;
      const catches = /\bcatch\b/.test(sourceAt(file));
      expect({ file: relative, catches }).toEqual({ file: relative, catches: false });
    }
  });
});

describe("the mark is unchanged", () => {
  const card = sourceAt(EPISODE_CARD);

  /** No new marking path: the card reaches the same hook, the same store and the same
   *  sweep the Ongoing tile did, and introduces none of its own. */
  it("records through the existing hook and the existing sweep", () => {
    expect(card).toMatch(/useUpNextMark\(entry\)/);
    expect(card).toMatch(/<WatchSweep onSettled=\{mark\.settle\}/);
    expect(card).toMatch(/RECORDING_GLYPH/);
  });

  /**
   * The advance happens **at settle**, not at press. It is the queue's position that moves
   * and `up-next-mark.ts` that moves it, so what this asserts is that the card did not
   * grow a second timing of its own — no `setTimeout`, no `useEffect` waiting on the wash.
   */
  it("adds no timing of its own around the sweep", () => {
    expect(card).not.toMatch(/setTimeout|setInterval|useEffect/);
  });

  it("writes no action of its own", () => {
    expect(card).not.toMatch(/recordWatch|useTransition|"use server"/);
  });

  /** The check is a sibling of the link, never inside it, so a thumb on the check is never
   *  also a navigation. */
  it("keeps the check outside the card's link", () => {
    const link = card.indexOf("<Link");
    const closes = card.indexOf("</Link>");
    const control = card.indexOf("{control}");

    expect(link).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(closes);
  });
});

/** Every `.ts`/`.tsx` under a directory. A list of files goes stale; a walk does not. */
function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}
