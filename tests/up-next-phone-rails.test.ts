import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const PENDING_CARD = `${UP_NEXT}/up-next-pending-card.tsx`;
const FILM_RAIL = `${UP_NEXT}/up-next-film-rail.tsx`;
const NOTHING = `${UP_NEXT}/up-next-nothing.tsx`;
/** #274's three: the desktop rail's tile, the season row that keeps the episode page, and
 *  the search result. None of them is a phone rail, and they are asserted here because
 *  this is the suite that reads what the surfaces around Up next link to. */
const TILE = `${UP_NEXT}/up-next-tile.tsx`;
const SEASON_ROWS = "app/(signed-in)/library/programme-note-episodes.tsx";
const SEARCH_RESULT = "app/(signed-in)/search/catalogue-result.tsx";

/**
 * A file with its comments taken out — `tests/episode-modal.test.ts`'s device, for its
 * reason. Every file here argues for itself at length, and #274's assertions are mostly
 * about a destination appearing **nowhere**; against the raw text those become assertions
 * about the prose, which is prose this codebase always has.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every source file a docblock could legitimately be citing. Built once — the citation
 *  check below asks it a question per reference. */
const ALL_SOURCES = ["app", "db", "cache", "errors", "lib", "tmdb"].flatMap((directory) =>
  sourceFiles(path.join(REPOSITORY_ROOT, directory)),
);

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

  /**
   * **And the same again by *component name*, which is the spelling the two checks above
   * miss.**
   *
   * They match a backticked *path*, and three stale references survived them by naming the
   * component instead — `UpNextGroups` in this route's own `loading.tsx`, and `GroupTile`
   * in `title-detail-view.tsx` and `programme-note-content.tsx`, the last two asserting a
   * poster morph whose source this ticket deleted. A docblock that names a deleted export
   * reads exactly as authoritatively as one that names a deleted file, and `CLAUDE.md` does
   * not distinguish them: *the live system outranks any note about it*.
   *
   * Word-bounded, so `RailSection` — which genuinely descends from the deleted
   * `GroupSection` and says so in the past tense — is not caught by a substring.
   */
  it("leaves no citation of the deleted group components by name either", () => {
    const gone = /\b(UpNextGroups|GroupTile|GroupScreen|HomeGroup|OngoingTile|OngoingGroup|TitleSheetProvider)\b/;

    for (const file of sourceFiles(path.join(REPOSITORY_ROOT, "app"))) {
      const relative = path.relative(REPOSITORY_ROOT, file);
      const cites = gone.test(readFileSync(file, "utf8"));
      expect({ file: relative, cites }).toEqual({ file: relative, cites: false });
    }
  });

  /**
   * The counterpart failure: a citation of a file that never existed. `up-next-phone-rail.tsx`
   * cited `up-next-film-card.tsx` — the film card is a local function inside
   * `up-next-film-rail.tsx` — which no deletion check could catch, because there was
   * nothing to delete. Every backticked `.tsx`/`.ts` path this ticket's own files cite must
   * resolve.
   */
  it("cites only files that exist, from every file this ticket added", () => {
    const mine = [
      SURFACE,
      RAIL_SECTION,
      EPISODE_RAIL,
      EPISODE_CARD,
      FILM_RAIL,
      NOTHING,
      `${UP_NEXT}/episode-card-line.ts`,
      // #272's pending card, joining the list for the same reason the rest are on it: it is
      // a new file on this surface, and a citation it invents is a citation nothing else
      // would ever catch.
      PENDING_CARD,
    ];

    let checked = 0;

    for (const file of mine) {
      const source = sourceAt(file);
      const cited = [...source.matchAll(/`([a-z0-9-]+\/)*([a-z0-9-]+\.tsx?)`/g)].map(
        ([whole]) => whole.slice(1, -1),
      );
      checked += cited.length;

      for (const reference of cited) {
        // A bare basename is cited relative to nothing in particular, so the check is that
        // some file of that name exists somewhere under `app/`, `db/` or `cache/`.
        const basename = path.basename(reference);
        const found = ALL_SOURCES.some((one) => path.basename(one) === basename);
        expect({ file, reference, found }).toEqual({ file, reference, found: true });
      }
    }

    // A floor, because a regex that matched nothing would pass every assertion above
    // without looking at a single citation — the failure mode this repository writes
    // `expect(...).toBeGreaterThan(0)` for everywhere else.
    expect(checked).toBeGreaterThan(20);
  });
});

describe("the next-episodes rail is the three orderings concatenated", () => {
  const source = sourceAt(EPISODE_RAIL);

  /**
   * **The assertion this file exists for.** Ongoing, then coming back, then old friends —
   * the sequence the five deleted groups expressed structurally, now expressed as one line
   * of spread syntax that nothing else in the build would notice going wrong.
   *
   * **#272 narrowed the first of the three and did not reorder them.** Ongoing can now hold
   * a title whose episodes have not mirrored, which has no run to mark and no episode to
   * draw, so `isEpisodeEntry` takes the episode-bearing half of that rail here — the same
   * three arrays, in the same order, with the pending cards lifted out and drawn ahead of
   * the whole sequence (below).
   */
  it("spreads ongoing, then comingBack, then oldFriends, in that order", () => {
    expect(source).toMatch(
      /\[\s*\.\.\.rails\.ongoing\.filter\(isEpisodeEntry\),\s*\.\.\.rails\.comingBack,\s*\.\.\.rails\.oldFriends,?\s*\]/,
    );
  });

  /**
   * **A pending card is drawn before the concatenation, not inside it** — issue #272.
   *
   * *At the head of Ongoing* is the ticket's own wording, and Ongoing leads this rail, so
   * on the phone that means the head of the whole track. It fails silently in the way this
   * file was built for: put the pending cards after `showing` and the reader who just added
   * a show scrolls past every cold title in their library to find it, with nothing anywhere
   * throwing.
   */
  it("draws the pending cards ahead of every episode card", () => {
    const pendingAt = source.indexOf("<UpNextPendingCard");
    const episodeAt = source.indexOf("<UpNextEpisodeCard");
    expect(pendingAt).toBeGreaterThan(-1);
    expect(episodeAt).toBeGreaterThan(-1);
    expect(pendingAt).toBeLessThan(episodeAt);
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
  /**
   * The track is `RememberedTrack` since #276 — a client `<ol>` carrying the rail's own
   * scroll offset across a navigation away and back — so the gutter is asserted on the
   * `className` it is handed rather than on a literal `<ol>`. The property is unchanged and
   * is the reason this is not just a class-list check: the padding is on the *track*, not
   * on the `<section>`.
   */
  it("puts the gutter on the track rather than on the section around it", () => {
    expect(section).toMatch(/<section className="pt-\[26px\]">/);
    expect(section).toMatch(/<RememberedTrack[\s\S]*?className="[^"]*px-\[22px\]/);
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
    // #272: the rail is empty when it holds neither a pending card nor an episode card.
    // A reader whose only title is one still mirroring has a rail with one card on it, not
    // an absent rail — the tab must not read as empty for a title just added to it.
    expect(sourceAt(EPISODE_RAIL)).toMatch(
      /if \(pending\.length === 0 && showing\.length === 0\) return null;/,
    );
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

/**
 * **Issue #274 — every tile and every card on this tab opens the title's own page.**
 *
 * The tab used to answer a press three different ways: a show tile wrote selection state,
 * a film tile navigated, and a next-episodes card navigated somewhere else again. One
 * model for what a tap does is the property, and it fails **silently** in the worst way
 * available to a link — the press is answered, something opens, and it is the wrong thing.
 * Nothing throws, nothing looks broken, and a reader who asked for a show gets an episode.
 *
 * The desktop's half of the same rule is here too, and it is the reversal's other edge: on
 * `lg` and up a tile must still swap the programme note pane **without navigating**. A
 * `<Link>` that stopped guarding its own click would take the whole two-pane layout out at
 * once, and that failure is loud only if somebody is looking at a desktop.
 */
describe("every tile and card on Up next opens the title's page", () => {
  const tile = codeOf(sourceAt(TILE));

  /**
   * The show tile is a link, which is the mechanism the film tile already had. A `<button>`
   * that called `router.push` would open the same page and still be the wrong answer: it
   * cannot be middle-clicked, cannot be opened in a new tab, and does not tell a screen
   * reader it is a link.
   */
  it("makes the show tile a link to the library entry's page", () => {
    expect(tile).toMatch(/<Link\s+href=\{`\/library\/\$\{entry\.libraryEntryId\}`\}/);
    expect(tile).not.toMatch(/<button/);
  });

  /** The same destination reached the same way, which is the acceptance criterion's own
   *  words: a film and a show behave the same way on the same tab. */
  it("gives the film tile that destination by the same mechanism", () => {
    expect(codeOf(sourceAt(FILM_RAIL))).toMatch(
      /<Link href=\{`\/library\/\$\{film\.libraryEntryId\}`\}/,
    );
  });

  /** And the card, retargeted from the episode. The negative is the load-bearing half —
   *  a card that gained the title's href beside the episode's would pass the positive. */
  it("sends a next-episodes card to the show's page, not the episode's", () => {
    const card = codeOf(sourceAt(EPISODE_CARD));

    expect(card).toMatch(/href=\{`\/library\/\$\{entry\.libraryEntryId\}`\}/);
    expect(card).not.toMatch(/\/episode\//);
  });

  /**
   * **The episode's page is retargeted away from, not deleted.** It keeps a season row
   * inside the title, and the route it deep-links to is still on disk. Asserted because
   * the cheap way to satisfy every line above is to stop having an episode page at all,
   * and #253's surface is not this ticket's to remove.
   */
  it("leaves the episode's own page reachable from a season row and by deep link", () => {
    expect(codeOf(sourceAt(SEASON_ROWS))).toMatch(
      /href=\{`\/library\/\$\{libraryEntryId\}\/episode\/\$\{episode\.id\}`\}/,
    );
    expect(
      existsSync(
        path.join(
          REPOSITORY_ROOT,
          "app/(signed-in)/library/[entryId]/episode/[episodeId]/page.tsx",
        ),
      ),
    ).toBe(true);
  });

  /** A reader can read about a title properly before deciding to add it. #273 made this
   *  an ordinary navigation by deleting the interception that captured it; this pins the
   *  destination, which is the half of it a manifest audit cannot see. */
  it("sends a search result to the title's full page", () => {
    expect(codeOf(sourceAt(SEARCH_RESULT))).toMatch(
      /href=\{`\/titles\/\$\{result\.kind\}\/\$\{result\.tmdbId\}`\}/,
    );
  });

  /**
   * **The phone writes no selection.** Every `select(` in the tile sits after the
   * breakpoint check, so the only click that reaches the selection store is a desktop
   * one; a phone press falls through to the link's own default and navigates.
   *
   * Positions rather than presence, because presence is what a second, unguarded call
   * would also satisfy — and an unguarded `select()` beside a guarded one is the exact
   * shape of this regression: the pane swaps *and* the phone routes.
   */
  it("writes selection state only on the desktop side of the breakpoint", () => {
    const guard = tile.indexOf("matchMedia(DESKTOP_BREAKPOINT)");
    expect(guard).toBeGreaterThan(-1);

    const writes = [...tile.matchAll(/\bselect\(/g)].map((match) => match.index);
    expect(writes.length).toBeGreaterThan(0);
    for (const at of writes) expect({ at, after: at > guard }).toEqual({ at, after: true });
  });

  /**
   * **And it is the one breakpoint constant, not a second copy of `1024px`.**
   * `selectable-entry.tsx` exports it precisely so that the JS copy of `lg` exists once;
   * a literal here would be the silent second the constant was named to prevent.
   */
  it("takes the breakpoint from the one place that names it", () => {
    expect(sourceAt(TILE)).toMatch(
      /import \{ DESKTOP_BREAKPOINT \} from "@\/app\/\(signed-in\)\/library\/selectable-entry"/,
    );
    expect(tile).not.toMatch(/min-width:\s*1024px/);
  });

  /**
   * **On `lg` and up nothing navigates**, which is `DESIGN.md`'s Never-Navigate-Away Rule
   * and the whole reason the pane exists. The desktop branch has to stop the link before
   * the browser follows it, and that `preventDefault` is the one line standing between the
   * two-pane layout and a full page load on every tile press.
   */
  it("stops the navigation on the desktop rather than letting both happen", () => {
    expect(tile).toMatch(/preventDefault\(\)/);
  });

  /** The pane and its four-phase pending machine are untouched — only the phone's use of
   *  selection went. Asserted against the pane's own file so that "unchanged" is a claim
   *  something checks. */
  it("leaves the programme note pane driven by the same selection", () => {
    const pane = sourceAt("app/(signed-in)/library/programme-note.tsx");

    expect(pane).toMatch(/useLibrarySelection\(\)/);
    expect(pane).toMatch(/selectedEntryId/);
  });
});

/**
 * **Issue #277 — the recording control gets a real dead zone from the card's tap area.**
 *
 * The report this answers is second-hand and **unreproduced**: on Android a tap on a card
 * sometimes appears to land on the check rather than opening the card, so a reader records
 * a watch they did not ask for. The owner does not have the device. What ships is a
 * hardening that stands on its own merits, and this suite asserts the hardening — not a
 * fix, because nothing here can prove one.
 *
 * The property, and it is the kind that fails **silently**: the link and the check are two
 * targets sharing an edge. Every assertion in this file passes with them flush against
 * each other, and so does every pixel of the rendered card — the only thing that changes
 * is what a fat finger lands on, which no test in this repository can see.
 *
 * The second half is `DESIGN.md`'s bounding-rect guarantee (§6) and #250's own
 * *the rail never reflows under a thumb*: the dead zone comes out of the link's own
 * bottom padding rather than out of the card's height, so the box is unchanged. A dead
 * zone that made the card taller would be a fix for one complaint that caused another.
 */
describe("the recording control has a dead zone from the card's tap area", () => {
  const card = sourceAt(EPISODE_CARD);
  const code = codeOf(card);

  /** The gap itself, stated once and applied to the link rather than typed at the element
   *  — a second copy is how the two halves below come to disagree. */
  it("names the dead zone once and puts it on the card's link", () => {
    expect(code).toMatch(/const TAP_DEAD_ZONE = "mb-1"/);
    expect(code).toMatch(/className=\{`pressable block \$\{TAP_DEAD_ZONE\}`\}/);
  });

  /**
   * **Where the space came from.** The link's text block used to end in `pb-1`, and that
   * `4px` is now the dead zone: taken out of the link's own box and put between the two
   * targets. The card is exactly as tall as it was, which is why this asserts the padding
   * is *gone* rather than merely that a margin exists — a margin added beside the padding
   * would separate the targets and grow every card on the rail by four pixels.
   */
  it("takes the gap out of the link's own bottom padding, not out of the card", () => {
    expect(code).toMatch(/className="px-\[14px\] pt-3"/);
    expect(code).not.toMatch(/pb-1/);
  });

  /** The control's target is untouched. `44px` is `DESIGN.md` §6's floor and the one
   *  direction a dead zone must never come out of.
   *
   *  **Updated for the press register (#282).** The hit box now declares the control
   *  register beside `pressable`, which is a class token and costs the target nothing —
   *  the `h-11` this asserts is the point and is exactly as it was. */
  it("costs the control nothing of its 44px target", () => {
    expect(code).toMatch(/flex min-h-11 items-center/);
    expect(code).toMatch(
      /CHECK_HIT_BOX = `pressable \[--press-register:1\] group flex h-11 shrink-0/,
    );
  });

  /** And the card's measure is the same measure, so the rail lays out as it did. */
  it("leaves the card's box and the rail's layout alone", () => {
    expect(code).toMatch(/CARD_WIDTH = 262/);
    expect(code).toMatch(/CARD = "w-\[262px\] shrink-0 snap-start"/);
    expect(code).toMatch(/FRAME = "w-full \[--still-radius:0\]"/);
  });

  /**
   * The other half of the acceptance criterion, and the half that was already true: the
   * picture and the text are **inside** the link and the check is outside it, so the only
   * thing that records a watch is the control itself. Asserted here beside the dead zone
   * because the two are one claim — *tapping the card opens the card* — and a refactor
   * that moved the check inside the link would leave the gap looking correct and the
   * behaviour wrong.
   */
  it("keeps the picture and the text inside the link and the control outside it", () => {
    const link = code.indexOf("<Link");
    const closes = code.indexOf("</Link>");

    expect(link).toBeGreaterThan(-1);
    expect(code.indexOf("<CardFrame")).toBeGreaterThan(link);
    expect(code.indexOf("<CardFrame")).toBeLessThan(closes);
    expect(code.indexOf("{entry.titleName}")).toBeLessThan(closes);
    expect(code.indexOf("{control}")).toBeGreaterThan(closes);
  });

  /**
   * **No telemetry.** #277 ships the hardening and explicitly not the instrumentation that
   * would prove it — the report stays unreproduced, and a beacon added to find out would
   * be the one thing the ticket rules out.
   */
  it("adds no instrumentation to the tap", () => {
    expect(code).not.toMatch(/captureMessage|addBreadcrumb|Sentry|analytics|track\(|beacon/i);
  });
});

/**
 * The documents, amended in this commit rather than after it — `CLAUDE.md` binds them and
 * `DESIGN.md` records two prior occasions where a note and the code it described drifted
 * apart silently. Both reversals are written as reversals.
 */
describe("the documents record the reversal", () => {
  it("has DESIGN.md saying a tap on Up next opens a page", () => {
    const design = sourceAt("DESIGN.md");
    const from = design.indexOf("### Opening a title");
    const section = design.slice(from, design.indexOf("\n### ", from + 4));

    expect(section).toMatch(/#274/);
    expect(section).toMatch(/opens the title's own page/);

    /**
     * **The sheet survives only inside a quotation.** `CLAUDE.md` asks a reversal to be
     * written as one, so the sentence this section used to open with is kept — in a
     * blockquote, in the past tense. What must not survive is the same sentence asserted
     * in the document's own voice, which is the drift `DESIGN.md` records two prior
     * occasions of. So the check is over the section's *unquoted* lines.
     */
    const asserted = section
      .split("\n")
      .filter((line) => !line.trimStart().startsWith(">"))
      .join("\n");

    expect(asserted).not.toMatch(/raises a sheet over the tab/);
  });

  it("has SPEC.md §7's surfaces section carrying the same reversal", () => {
    const spec = sourceAt("SPEC.md");
    const surfaces = spec.slice(
      spec.indexOf("## 7. The surfaces"),
      spec.indexOf("### Up next — ordering"),
    );

    expect(surfaces).toMatch(/#274/);
  });

  /**
   * **And #277's framing, which is the part a future reader is owed.** The hardening is
   * defensible on its own and it is *not* a fix — the report was never reproduced. A
   * document that recorded the change without recording that would leave the next reader
   * believing the Android misfire was dealt with, and there is nothing in the build that
   * would correct them.
   */
  it("has DESIGN.md recording the Android hardening as a hypothesis rather than a fix", () => {
    const design = sourceAt("DESIGN.md");
    const from = design.indexOf("### The Android tap");
    expect(from).toBeGreaterThan(-1);

    const section = design.slice(from, design.indexOf("\n### ", from + 4));

    expect(section).toMatch(/#277/);
    expect(section).toMatch(/unreproduced/);
    expect(section).toMatch(/dead zone/);
    // The pager's half of the same hardening, so the section covers both halves rather
    // than the one that is visible in a card.
    expect(section).toMatch(/pager/);
    // And it must say what happens if the misfire survives, which is the recoverable part.
    expect(section).toMatch(/did not address it|was not addressed here/);
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
