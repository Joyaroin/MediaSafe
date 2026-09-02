import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Issue #306, *The Up next reorder animates instead of teleporting* — spec #300.
 *
 * The row a reader just marked can move: a title above it finishing empties that `<li>`
 * out of the list and every row after it reflows into the gap under the reader's own
 * thumb, and a later render can put the row itself first once it is the most recently
 * watched. Today that move is a single-frame jump — React swaps the DOM in place and the
 * browser paints the new layout with nothing between the two. Motion's `layout` animation
 * is the fix: given to an element whose position or size changes between renders, it
 * measures both and interpolates, so the same React update now travels.
 *
 * ── Why this reads source rather than rendering ───────────────────────────────────────
 *
 * `up-next-episode-row.tsx` and its neighbours are client components over
 * `useSyncExternalStore`, downstream of `db/access.ts`'s `server-only` import — the same
 * wall `tests/up-next-phone-rails.test.ts` and `tests/nav-transitions.test.ts` already hit
 * for this exact directory, and the same answer: read the source.
 *
 * ── Two properties, two shapes ────────────────────────────────────────────────────────
 *
 * The first is structural: every row this ticket touches is a Motion mini component
 * (`m.li`) carrying `layout`, which is `tests/upcoming-surface.test.ts`'s own device for
 * proving an element goes through Motion at all — the root's `reducedMotion="user"` only
 * reaches an element that is Motion's to begin with, and a plain `<li>` with a CSS
 * transition would sail straight past it.
 *
 * The second is the ticket's own acceptance criterion, restated as a test: **a key that
 * becomes positional has to fail something.** `up-next-episode-row.tsx`'s own docblock and
 * the ticket both note every Up next list already keys on `libraryEntryId`, never a
 * position — this asserts that rather than establishes it, and the "the check can fail"
 * cases below prove the assertion is not vacuous.
 */

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

function sourceAt(relativePath: string): string {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const UP_NEXT = "app/(signed-in)/up-next";
const ROW = `${UP_NEXT}/up-next-episode-row.tsx`;
const EPISODE_RAIL = `${UP_NEXT}/up-next-episode-rail.tsx`;
const RAILS_SURFACE = `${UP_NEXT}/up-next-rails-surface.tsx`;
const FILM_RAIL = `${UP_NEXT}/up-next-film-rail.tsx`;
const MOTION_PROVIDER = "app/motion-provider.tsx";

describe("the row travels instead of teleporting", () => {
  const row = sourceAt(ROW);

  /**
   * `motion/react-m` and not `motion/react` — `motion-provider.tsx`'s `LazyMotion strict`
   * throws the moment a full `motion.*` component renders inside it, so importing the
   * heavier spelling here would fail loudly rather than silently re-adding the bundle
   * `LazyMotion` exists to keep out of every route's first load.
   */
  it("renders both row kinds through Motion's mini component, not a bare <li>", () => {
    expect(row).toContain('from "motion/react-m"');
    expect(row).not.toMatch(/<li className=\{ROW\}>/);
    expect(row.match(/<m\.li\b/g)).toHaveLength(2);
  });

  /**
   * `layout` is the one word doing the whole job: without it Motion mounts the element and
   * does nothing when its position changes between renders, which is indistinguishable
   * from the plain `<li>` this replaces.
   */
  it("gives every row layout animation, not merely a Motion mount", () => {
    const rows = [...row.matchAll(/<m\.li([^>]*)>/g)];
    expect(rows).toHaveLength(2);
    for (const [, attributes] of rows) {
      expect(attributes).toMatch(/\blayout\b/);
    }
  });

  /** The row's own box is unchanged — `ROW`'s class, not a second style. */
  it("keeps ROW as the row's only class, on both row kinds", () => {
    expect(row.match(/<m\.li layout className=\{ROW\}>/g)).toHaveLength(2);
  });

  /**
   * Reduced motion is `MotionConfig`'s, at the root, and not a branch here — the app has
   * one answer to it and a second would be a second answer (`upcoming-surface.test.ts`
   * makes the identical argument for the pager). What this proves is that the row goes
   * through Motion at all, which is what lets the root's setting reach it; there is
   * nothing left for this file to negotiate locally.
   */
  it("adds no reduced-motion branch of its own", () => {
    expect(row).not.toMatch(/prefers-reduced-motion|useReducedMotion/);
  });

  it("leaves the root's reduced-motion setting in place", () => {
    expect(sourceAt(MOTION_PROVIDER)).toContain('reducedMotion="user"');
  });

  /**
   * The poster morph and the layout animation are two different mechanisms — the browser's
   * View Transition API and Motion's own transform interpolation — and the acceptance
   * criterion is that neither is dropped to make room for the other. `ViewTransition` is
   * still there, still exactly once (`nav-transitions.test.ts` already pins that count),
   * and it still sits inside the row Motion now animates.
   */
  it("keeps the poster's ViewTransition nested inside the animated row", () => {
    expect(row.match(/<ViewTransition/g)).toHaveLength(1);
    expect(row.indexOf("<m.li layout className={ROW}>")).toBeLessThan(
      row.indexOf("<ViewTransition"),
    );
  });

  /** No new client boundary — the row was already `"use client"`, and this ticket adds no
   *  hook, no store and no second directive. */
  it("was already a client component and stays exactly that", () => {
    expect(row.match(/^"use client";/gm)).toHaveLength(1);
  });
});

/** No new client boundary on the surfaces that only ever hand the row down as a child —
 *  `SPEC.md`'s reasoning for why this ticket adds none at all. */
describe("no new client boundary is introduced", () => {
  it("leaves the desktop rails surface a server component", () => {
    expect(sourceAt(RAILS_SURFACE)).not.toMatch(/^"use client";/m);
  });

  it("leaves the films rail a server component", () => {
    expect(sourceAt(FILM_RAIL)).not.toMatch(/^"use client";/m);
  });
});

/** Every `key={...}` attribute in a source string, in order. */
function listKeys(source: string): string[] {
  return [...source.matchAll(/key=\{([^}]*)\}/g)].map(([, expression]) => expression.trim());
}

/**
 * The rule itself: a key must read the library entry's own identity, never a position.
 * `libraryEntryId` is the one field every `UpNextEntry`, `UpNextPendingEntry` and
 * `LibraryStateGroupEntry` on this surface carries and the one a refresh cannot renumber,
 * which is `db/access.ts`'s own guarantee and the reason a layout animation can see a move
 * here at all — it has no continuity to measure across a key built from where a row
 * happened to sit.
 */
function auditKeyStability(source: string): { readonly positional: readonly string[] } {
  const positional = listKeys(source).filter((key) => !/\.libraryEntryId$/.test(key));
  return { positional };
}

describe("every Up next list render keys on the library entry's identity", () => {
  const surfaces = [
    ["the phone's next-episodes rail", EPISODE_RAIL],
    ["the desktop's three rails", RAILS_SURFACE],
    ["the phone's films rail", FILM_RAIL],
  ] as const;

  for (const [label, file] of surfaces) {
    it(`${label} (${file}) keys every row on libraryEntryId`, () => {
      expect(auditKeyStability(sourceAt(file)).positional).toEqual([]);
    });
  }

  /** A floor, not a count (`up-next-phone-rails.test.ts`'s own reasoning): a file with no
   *  `key={` in it at all would pass every assertion above having checked nothing. */
  it("is looking at files that key something in the first place", () => {
    for (const [, file] of surfaces) {
      expect(listKeys(sourceAt(file)).length).toBeGreaterThan(0);
    }
  });
});

describe("the key-stability check can fail", () => {
  it("flags a key built from the array index", () => {
    const source = "{entries.map((entry, index) => (<Row key={index} entry={entry} />))}";
    expect(auditKeyStability(source).positional).toEqual(["index"]);
  });

  it("flags a key built from a field that is not the library entry's identity", () => {
    const source = "{entries.map((entry) => (<Row key={entry.episodeId} entry={entry} />))}";
    expect(auditKeyStability(source).positional).toEqual(["entry.episodeId"]);
  });

  it("passes a key that reads the library entry id off whichever variable a caller names", () => {
    const source = "{films.map((film) => (<Row key={film.libraryEntryId} film={film} />))}";
    expect(auditKeyStability(source).positional).toEqual([]);
  });
});
