import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative as relativeTo } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract step — issue #312, the sweep #310 and #311 promised. `app/accent-meaning.ts`
 * names the accent's three sanctioned meanings and #310/#311 migrated the disputed call
 * sites onto them; this file is what makes a fourth meaning impossible to add silently,
 * the way `tests/press-spring.test.ts`'s `PRESS_CALL_SITES` sweep already does for the
 * press register and `tests/accent-migrate.test.ts`'s `DIALOG_FILES` already does for the
 * five re-narrowed dialogs.
 *
 * ── What counts as an accent use ─────────────────────────────────────────────────────
 *
 * Every `text-accent`, `bg-accent`, `border-accent` or `decoration-accent` token (with or
 * without a variant prefix — `hover:`, `group-hover:`…), every `text-accent-ink`, every
 * `var(--color-accent)` (the one form a Tailwind class cannot reach — `press-mark.tsx`'s
 * SVG `fill`), and every `.ink`/`.solid` read off one of `app/accent-meaning.ts`'s three
 * constants. Read from source with comments blanked first, for `tests/palette.test.ts`'s
 * own reason: this codebase discusses the accent at length in prose, and a raw scan finds
 * the discussion and reports it as a use. `errors/recovery-buttons.ts`'s own docblock
 * names `text-accent`/`bg-accent`+`text-accent-ink` in backticks a few lines above the
 * real declarations — the exact sentence a stripped scan has to not count twice.
 *
 * ── Two ways to pass, and nothing else ───────────────────────────────────────────────
 *
 * A call site either **declares** one of the three meanings — imports the constant from
 * `app/accent-meaning.ts` and reads `.ink`/`.solid` off it, the way #310 and #311 already
 * migrated seven of them — or it is a **documented literal exception**: named in
 * `ACCENT_CALL_SITES` below with a reason, the way the role table already carries the
 * brand mark, the failure system and a surface's primary action as roles that predate and
 * were never part of the disagreement. What a call site may not do is neither — reach
 * for the token with no entry here — and the whole-tree walk below is what catches that:
 * it is not a fixed list of files somebody remembered to update, it is every `.ts`/`.tsx`
 * file under `app/`, `errors/` and `lib/`, same as `tests/palette.test.ts`'s shadow sweep
 * and `tests/press-spring.test.ts`'s register sweep.
 */

const ROOT = join(__dirname, "..");

/** Source with comments blanked, length preserved. Every sweep in this repository reads
 *  this rather than the raw file, for the reason the file header gives. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function relative(path: string): string {
  return relativeTo(ROOT, path);
}

/** The directories that ship, walked from their own roots — `tests/palette.test.ts`'s
 *  `SHIPPING_DIRECTORIES`, for the reason its own docblock gives: a skip-list over the
 *  repository root swept `.claude/worktrees/` once, auditing other builders' work in
 *  progress rather than this tree. */
const SHIPPING_DIRECTORIES = ["app", "errors", "lib"];

/** `app/accent-meaning.ts` is excluded: it is the declaration site the other three
 *  meanings' `ink`/`solid` literals live in, and a sweep that swept its own source would
 *  be checking the manifest against itself. */
const DECLARATION_FILE = join("app", "accent-meaning.ts");

function sourceFiles(): string[] {
  const found: string[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) found.push(path);
    }
  }

  for (const dir of SHIPPING_DIRECTORIES) walk(join(ROOT, dir));
  return found.filter((path) => relative(path) !== DECLARATION_FILE);
}

/**
 * Every accent token in a file's stripped source, in the order they appear.
 *
 * `(?:text|bg|border|decoration)-accent(?:-ink)?` catches every Tailwind spelling with an
 * optional variant prefix (`hover:`, `group-hover:`…) folded into the match rather than
 * dropped, so `hover:bg-accent` and `bg-accent` are counted as the distinct occurrences
 * they are — two tokens in one template literal is two chances to drift, not one.
 * `(?:RECORDS_A_WATCH|LIVE_EDGE_OF_THE_RECORD|THE_BUTTON_REGISTER)\.(?:ink|solid)` is a
 * *declared* use — the call site imported the meaning rather than typing the token — and
 * `var\(--color-accent\)` is the one form a Tailwind class cannot reach at all.
 */
const ACCENT_TOKEN =
  /(?:[\w-]+:)*(?:text|bg|border|decoration)-accent(?:-ink)?\b|(?:RECORDS_A_WATCH|LIVE_EDGE_OF_THE_RECORD|THE_BUTTON_REGISTER)\.(?:ink|solid)|var\(--color-accent\)/g;

function accentTokens(path: string): string[] {
  return [...code(source(relative(path))).matchAll(ACCENT_TOKEN)].map((match) => match[0]);
}

type Meaning =
  | "RECORDS_A_WATCH"
  | "LIVE_EDGE_OF_THE_RECORD"
  | "THE_BUTTON_REGISTER"
  | "LITERAL_EXCEPTION";

interface AccentSite {
  /** One of the three sanctioned meanings, or a documented literal exception. */
  readonly meaning: Meaning;
  /** How many accent tokens `accentTokens()` finds in this file. Not merely "has some" —
   *  a call site gaining or losing one is the failure #312's acceptance criteria name by
   *  name, and a file-level presence check would miss both. */
  readonly tokens: number;
  /** Named, not merely tagged — `#312`'s acceptance criteria: "documented places where the
   *  accent is a literal are named as explicit exceptions rather than silently skipped." */
  readonly reason: string;
}

/**
 * The frozen manifest. Built from the tree on 2026-09-02, against the state #311 left it
 * in — never from the older hand-kept list, which #310's docblock already found stale
 * (it cites `rating-control.tsx` and `up-next-tile.tsx`, and neither exists in this tree).
 *
 * **Declared meanings** (`RECORDS_A_WATCH`, `LIVE_EDGE_OF_THE_RECORD`, `THE_BUTTON_REGISTER`)
 * cover a call site that imports the constant, and — where `AccentMeaning` has no form to
 * reach for, such as a hover state — that constant's own literal companion in the same
 * string. `errors/recovery-buttons.ts`'s ghost outline is the worked example: the border
 * and the hover pair are typed, because `AccentMeaning` exports no `hover:`-prefixed form,
 * but they are the button register's own hover state and not a fourth meaning.
 *
 * **Literal exceptions** are every other role the table already names and nothing ever
 * contested — the brand mark, the failure system, a surface's primary action, and the two
 * screens' rail-heading register. The two amendments the table recorded by number are both
 * gone: #251's pager rule left with the pager (#399), and #252's countdown went dim when
 * Charcoal redrew Coming up (#401).
 */
const ACCENT_CALL_SITES: Readonly<Record<string, AccentSite>> = {
  // ── The three sanctioned meanings ──────────────────────────────────────────────────

  "app/(signed-in)/library/library-state.ts": {
    meaning: "LIVE_EDGE_OF_THE_RECORD",
    tokens: 1,
    reason: "STATE_LABELS.watching — #310's migration",
  },
  "app/buttons.ts": {
    meaning: "THE_BUTTON_REGISTER",
    tokens: 1,
    reason: "the primary button — issue #357's one solid main action per surface",
  },
  "app/(signed-in)/library/watch-mark-motion.tsx": {
    meaning: "RECORDS_A_WATCH",
    tokens: 1,
    reason:
      "WATCHED_TICK — the filled tick, the one face of the tick that says a watch exists " +
      "(Charcoal, issue #397). The not-watched and Up next faces are rings in dim and " +
      "text, and the quiet recording controls that kept accent hovers are gone.",
  },
  "app/(signed-in)/up-next/up-next-episode-row.tsx": {
    meaning: "RECORDS_A_WATCH",
    tokens: 1,
    reason:
      "the finish line in place of the episode line while a row holds on a season's last " +
      "episode — the UI overhaul's 'Watched', narrowed to the finish by issue #407",
  },
  "app/(signed-in)/up-next/tonight-featured.tsx": {
    meaning: "RECORDS_A_WATCH",
    tokens: 1,
    reason:
      "the finish line in place of the episode line while Tonight's featured episode holds " +
      "on a season's last episode (Charcoal, issues #400 and #407)",
  },

  // ── Literal exceptions: the brand mark ─────────────────────────────────────────────

  "app/press-mark.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the wordmark's struck bar, fill=\"var(--color-accent)\" — an SVG fill attribute " +
      "cannot read a Tailwind class: 'the brand mark … permanent'.",
  },

  // ── Literal exceptions: the failure system ─────────────────────────────────────────

  "app/global-error.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "the root failure boundary's 2px rule and heading — the failure system",
  },
  "errors/offline-banner.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "the sticky offline banner — the failure system",
  },

  // ── Literal exceptions: the rail-heading register ──────────────────────────────────


  // ── Literal exceptions: everything else, one call site apiece ─────────────────────

  "app/(signed-in)/library/title-hero.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the watched-progress bar fill — its own docblock: 'how far through you are right " +
      "now is the most literal reading of live on this page'",
  },
  "app/(signed-in)/settings/delete-account/page.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "hover:decoration-accent on the outbound 'Google connected apps' link",
  },
};

describe("every accent use in the shipping tree is classified, and no others", () => {
  const files = sourceFiles();

  it("sweeps app/, errors/ and lib/ and nothing else", () => {
    // A floor and a ceiling against the walk breaking silently — `tests/palette.test.ts`'s
    // own guard for its shadow sweep, restated for this one.
    expect(files.length).toBeGreaterThan(100);
    expect(files.length).toBeLessThan(600);
    expect(files.map(relative).filter((path) => path.startsWith(".claude"))).toEqual([]);
    expect(
      files.map(relative).every((path) => SHIPPING_DIRECTORIES.some((d) => path.startsWith(d))),
    ).toBe(true);
  });

  const found = files
    .map((path) => ({ file: relative(path), tokens: accentTokens(path) }))
    .filter((site) => site.tokens.length > 0);

  it("finds every file the manifest expects, and no file the manifest does not", () => {
    // The whole-tree property #312 exists for: a call site gaining the accent with no
    // entry here fails this, and a classified file losing every accent use fails it too
    // — `tests/press-spring.test.ts`'s `PRESS_CALL_SITES` proves the same property the
    // same way, by strict set equality rather than a fixed list somebody remembers to grow.
    expect(found.map((site) => site.file).sort()).toEqual(
      Object.keys(ACCENT_CALL_SITES).sort(),
    );
  });

  it.each(Object.entries(ACCENT_CALL_SITES))(
    "%s carries exactly the accent uses the manifest counts",
    (file, site) => {
      const tokens = accentTokens(join(ROOT, file));
      expect(
        tokens.length,
        `${file}: found ${JSON.stringify(tokens)}, manifest says ${site.tokens}`,
      ).toBe(site.tokens);
    },
  );

  it("names every literal exception with a reason, rather than skipping it silently", () => {
    for (const [file, site] of Object.entries(ACCENT_CALL_SITES)) {
      if (site.meaning !== "LITERAL_EXCEPTION") continue;
      expect(site.reason.length, `${file} must document why it is a literal exception`).toBeGreaterThan(
        10,
      );
    }
  });

  it("classifies every declared site as one of the three sanctioned meanings, never a fourth", () => {
    const SANCTIONED: readonly Meaning[] = [
      "RECORDS_A_WATCH",
      "LIVE_EDGE_OF_THE_RECORD",
      "THE_BUTTON_REGISTER",
      "LITERAL_EXCEPTION",
    ];
    for (const site of Object.values(ACCENT_CALL_SITES)) {
      expect(SANCTIONED).toContain(site.meaning);
    }
  });
});

describe("comments are blanked before matching, so prose about the accent cannot pass or fail the sweep", () => {
  it("does not count a token merely quoted inside a comment", () => {
    // `app/buttons.ts`'s docblock talks about the accent in prose; only its one real
    // declaration — the primary button's `THE_BUTTON_REGISTER.solid` — may count.
    const stripped = code(source("app/buttons.ts"));
    expect([...stripped.matchAll(ACCENT_TOKEN)]).toHaveLength(
      ACCENT_CALL_SITES["app/buttons.ts"].tokens,
    );
  });

  it("blanks a block comment to spaces of the same length, so an offset still lands on the right line", () => {
    const blanked = code("const x = 1; /* text-accent lives here */ const y = 2;");
    expect(blanked).not.toContain("text-accent");
    expect(blanked.length).toBe("const x = 1; /* text-accent lives here */ const y = 2;".length);
  });

  it("blanks a line comment the same way", () => {
    const blanked = code('const cls = "bg-accent"; // never border-accent, only bg-accent');
    expect([...blanked.matchAll(ACCENT_TOKEN)]).toHaveLength(1);
  });
});

describe("app/accent-meaning.ts declares the three meanings the sweep enforces", () => {
  it("is excluded from the sweep as the declaration site, and still declares all three", () => {
    const declared = source(DECLARATION_FILE);
    expect(declared).toContain("export const RECORDS_A_WATCH");
    expect(declared).toContain("export const LIVE_EDGE_OF_THE_RECORD");
    expect(declared).toContain("export const THE_BUTTON_REGISTER");
  });
});
