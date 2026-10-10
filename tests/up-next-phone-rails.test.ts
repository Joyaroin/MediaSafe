import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone's two rails — issue #250, replacing `tests/phone-groups-scroll.test.ts`, whose
 * five vertical groups this ticket deleted.
 *
 * Everything here is a property that would fail **silently** rather than on sight, which is
 * the line drawn around what earns a test:
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
 * `tests/up-next-episode-card-line.test.ts` (the two surviving strings, #250 narrowed by
 * #321), both of which drive real functions. This file covers only what is genuinely
 * structural.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const UP_NEXT = "app/(signed-in)/up-next";
const PAGE = `${UP_NEXT}/page.tsx`;
const SURFACE = `${UP_NEXT}/up-next-rails.tsx`;
const EPISODE_RAIL = `${UP_NEXT}/up-next-episode-rail.tsx`;
const FILM_RAIL = `${UP_NEXT}/up-next-film-rail.tsx`;
const NOTHING = `${UP_NEXT}/up-next-nothing.tsx`;
/** The Up next row. */
const TILE = `${UP_NEXT}/up-next-episode-row.tsx`;

/**
 * A file with its comments taken out — `tests/episode-modal.test.ts`'s device, for its
 * reason. Every file here argues for itself at length, and #274's assertions are mostly
 * about a destination appearing **nowhere**; against the raw text those become assertions
 * about the prose, which is prose this codebase always has.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");


/**
 * **Issue #320 — the Up next row draws the title's poster, and the episode's own still is
 * retired from it.** `up-next-episode-row.tsx` cannot be rendered under Vitest — it reaches
 * `@/db/access`'s `isPendingEntry`, which pulls in the `server-only`-guarded module
 * `up-next-phone-rails.test.ts`'s own docblock names — so this is a rendered-markup
 * property read the way this whole suite reads them: off the source, the same device
 * `tests/nav-transitions.test.ts` and `tests/up-next-reorder.test.ts` already use for this
 * exact file.
 *
 * Both row kinds are asserted: `RowFrame` (the markable and non-markable episode row) and
 * `UpNextPendingRow`, which shares the same box and the same reason a taller still-shaped
 * hole would be wrong for it too — a pending row becomes an episode row the moment the
 * mirror lands, and the two must already agree on the frame's shape.
 */
describe("the Up next row draws a poster and not a still", () => {
  const code = codeOf(sourceAt(TILE));

  it("draws through Poster, on both row kinds", () => {
    expect(code.match(/<Poster\b/g)).toHaveLength(2);
  });

  it("imports no still component and reads no still path", () => {
    expect(code).not.toMatch(/\bEpisodeStill\b/);
    expect(code).not.toMatch(/\bstillPath\b/);
  });

  it("draws the poster's own 2/3 box, not the still's 16/9 one", () => {
    expect(code).not.toMatch(/\bstill-radius\b/);
    // The row's own former constants — the still's width and its class string — renamed to
    // `ROW_POSTER_WIDTH`/`POSTER` rather than left beside the new box under a stale name.
    expect(code).not.toMatch(/\bSTILL\b/);
    expect(code).not.toMatch(/\bROW_STILL_WIDTH\b/);
    // The card's poster box (`up-next-card-styles.ts`), shared with the film cards.
    expect(code).toContain("const POSTER = CARD_POSTER;");
    expect(sourceAt(`${UP_NEXT}/up-next-card-styles.ts`)).toMatch(
      /\[--poster-radius:var\(--radius-4\)\]/,
    );
  });
});

/**
 * **Issue #321 — the meta line drops the air date and the runtime.** Same device as the
 * still's own describe block above, and for the identical reason: `up-next-episode-row.tsx`
 * cannot be rendered under Vitest, so this reads what the rendered markup would carry off
 * the source.
 *
 * `episode-card-line.ts`'s own suite (`tests/up-next-episode-card-line.test.ts`) proves the
 * two surviving strings are correct; this proves the row still calls them and calls nothing
 * else — the row's half of *removing two fields must not leave a gap*.
 */
describe("the Up next row's meta line carries no air date and no runtime", () => {
  const code = codeOf(sourceAt(TILE));

  it("reads the episode code, the remaining count, and nothing else, from episode-card-line", () => {
    expect(code).toMatch(
      /import \{ episodeCode, remainingInWords \} from "\.\/episode-card-line"/,
    );
    expect(code).not.toMatch(/\bepisodeMetaLine\b/);
    expect(code).not.toMatch(/\bairDateInWords\b/);
  });

  it("never reads an air date or a runtime off the entry or the queue", () => {
    expect(code).not.toMatch(/\bairDate\b/);
    expect(code).not.toMatch(/\bruntimeMins\b/);
  });

  it("still names the episode as real text beside the code, never the code alone", () => {
    // The code is a separate dim label, the episode's own name is the line
    // underneath it, and shortening the meta line must not collapse the two into one.
    expect(code).toMatch(
      /className="bill-title text-bill-xs text-text">\{code\}/,
    );
    expect(code).toMatch(/\{episodeName\}/);
  });

  it("keeps the remaining count on the tabular-figures hook", () => {
    expect(code).toMatch(
      /data-numeric>\s*\{remainingInWords\(remainingAfter\)\}/,
    );
  });
});


describe("the next-episodes rail is the two orderings concatenated", () => {
  const source = sourceAt(EPISODE_RAIL);

  /**
   * **The assertion this file exists for.** Ongoing, then old friends — the sequence the
   * five deleted groups expressed structurally, now expressed as one line of spread syntax
   * that nothing else in the build would notice going wrong. Coming back was between them
   * until it was deleted: a show whose Up next episode has not aired is not on this list.
   *
   * **#272 narrowed the first of the three and did not reorder them.** Ongoing can now hold
   * a title whose episodes have not mirrored, which has no run to mark and no episode to
   * draw, so `isEpisodeEntry` takes the episode-bearing half of that rail here — the same
   * arrays, in the same order, with the pending cards lifted out and drawn ahead of
   * the whole sequence (below).
   */
  it("spreads ongoing, then oldFriends, in that order", () => {
    expect(source).toMatch(
      /\[\s*\.\.\.rails\.ongoing\.filter\(isEpisodeEntry\),\s*\.\.\.rails\.oldFriends,?\s*\]/,
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
    const pendingAt = source.indexOf("<UpNextPendingRow");
    const episodeAt = source.indexOf("<UpNextEpisodeRow");
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
      /\[rails\.ongoing,\s*rails\.oldFriends\],/,
    );
  });

  it("names both, so neither can be dropped without this failing", () => {
    for (const rail of ["rails.ongoing", "rails.oldFriends"]) {
      expect({ rail, present: source.includes(rail) }).toEqual({
        rail,
        present: true,
      });
    }
  });

  /** The read keeps them apart so this file can put them in order. A read that had already
   *  flattened them would put the rule where no surface could see it. */
  it("leaves the read's two arrays as two, and has no coming-back rail", () => {
    const access = sourceAt("db/access.ts");
    expect(access).toMatch(/export interface UpNextRails \{[^}]*\bongoing\b/);
    expect(access).not.toMatch(
      /export interface UpNextRails \{[^}]*\bcomingBack\b/,
    );
    expect(access).toMatch(
      /export interface UpNextRails \{[^}]*\boldFriends\b/,
    );
  });
});



describe("the films rail", () => {
  const source = sourceAt(FILM_RAIL);

  /** Both predicates live in the read, and both are predicates rather than slices. */
  it("is the entries standing at Watchlist whose title is a film", () => {
    const access = sourceAt("db/access.ts");
    expect(access).toMatch(
      /eq\(libraryEntryState\.state, "watchlist" satisfies LibraryState\)/,
    );
    expect(access).toMatch(/eq\(title\.kind, "film" satisfies TitleKind\)/);
  });

  it("navigates to the title rather than opening anything over the screen", () => {
    // `\s+` rather than one space: #293 gave the link a `transitionTypes` of its own, so
    // the attributes wrapped. What this asserts is the destination, not the formatting.
    expect(source).toMatch(
      /<Link\s+href=\{`\/titles\/\$\{film\.libraryEntryId\}`\}/,
    );
  });

  /**
   * **One tap, like an episode.** A watchlist film can be logged from Up next without
   * opening it first — through the same `useWatchMark` path the film's own page uses, so
   * the optimism, rollback and Undo toast are the ones that already exist, not a second
   * marking path.
   */
  it("marks a film watched through the shared watch mark", () => {
    expect(source).toMatch(/useWatchMark\(/);
    expect(source).toMatch(/aria-label=\{`Mark \$\{film\.titleName\} watched`\}/);
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
    expect(sourceAt(FILM_RAIL)).toMatch(
      /if \(films\.length === 0\) return null;/,
    );
  });

  /** A screen with nothing at all is a *different* fact from either rail being empty, and
   *  it gets the handoff's own sentence rather than a blank page. */
  it("gives a screen with nothing at all the handoff's sentence", () => {
    expect(sourceAt(SURFACE)).toMatch(
      /if \(noEpisodes && films\.length === 0\) return <UpNextNothing \/>;/,
    );

    const nothing = sourceAt(NOTHING);
    expect(nothing).toContain("Nothing queued for tonight");
    expect(nothing).toContain("Add a show and its next episode turns up here.");
    expect(nothing).toContain("Search the catalogue");
  });

  /**
   * The two sentences answer two questions and must not be collapsed into one. The phone
   * asks *no next episode and no watchlist film*; the desktop asks *nothing watching and
   * nothing dated to come back*. These read differently
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
    expect(error).toMatch(
      /<ReadFailure reference=\{reference\} retry=\{retry\} \/>/,
    );
  });

  it("catches nothing anywhere on the read path", () => {
    for (const file of [PAGE, SURFACE, EPISODE_RAIL, FILM_RAIL]) {
      const relative = file;
      const catches = /\bcatch\b/.test(sourceAt(file));
      expect({ file: relative, catches }).toEqual({
        file: relative,
        catches: false,
      });
    }
  });
});
