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
 * screens' rail-heading register — plus the two amendments the table already records by number
 * (#251's pager rule, #252's countdown).
 */
const ACCENT_CALL_SITES: Readonly<Record<string, AccentSite>> = {
  // ── The three sanctioned meanings ──────────────────────────────────────────────────

  "app/(signed-in)/library/library-state.ts": {
    meaning: "LIVE_EDGE_OF_THE_RECORD",
    tokens: 1,
    reason: "STATE_LABELS.watching — #310's migration",
  },
  "app/(signed-in)/library/library-filter-bar.tsx": {
    meaning: "LIVE_EDGE_OF_THE_RECORD",
    tokens: 1,
    reason: "the unselected Watching chip — #310's migration",
  },
  "app/(signed-in)/library/episode-line.ts": {
    meaning: "LIVE_EDGE_OF_THE_RECORD",
    tokens: 1,
    reason: "EPISODE_NUMBER_UP_NEXT — #310's migration",
  },
  "errors/recovery-buttons.ts": {
    meaning: "THE_BUTTON_REGISTER",
    tokens: 10,
    reason:
      "GHOST_RECOVERY/_COMPACT and SOLID_RECOVERY/_COMPACT — #311's migration. The ghost " +
      "pair's border-accent and hover:bg-accent/hover:text-accent-ink are the register's " +
      "own literal companions: AccentMeaning has no hover-prefixed form to reach for.",
  },
  "app/(signed-in)/library/watch-mark-motion.tsx": {
    meaning: "RECORDS_A_WATCH",
    tokens: 8,
    reason:
      "the recording checkmark and its watched-state siblings. Issue #313 migrated " +
      "RECORDING_GLYPH onto RECORDS_A_WATCH.ink and dropped its group-hover fill — " +
      "border-accent is the meaning's own literal companion, the way THE_BUTTON_REGISTER's " +
      "ghost pair keeps its border literal in errors/recovery-buttons.ts. The three " +
      "QUIET_RECORDING_CONTROL variants keep their own hover:border-accent/hover:text-accent " +
      "literals — a different control (watched up to here), left untouched by this ticket.",
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
  "errors/failure-treatment.ts": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "FAILURE_SECTION/FAILURE_HEADING — read-failure/sign-in/sign-out's shared treatment",
  },
  "errors/offline-banner.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "the sticky offline banner — the failure system",
  },
  "errors/write-failure-toast.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "the lost-write toast's frame and heading — the failure system",
  },
  "app/(signed-in)/library/action-toast-toasts.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the Undo action toast (#307) — its own docblock: 'the same border-2 border-accent " +
      "bg-ground treatment errors/write-failure-toast.tsx draws for a lost write, spent " +
      "here for the opposite event'. A deliberate mirror of the failure system's frame for " +
      "a landed write, not one of the routine dialogs #311 re-narrowed off it.",
  },

  // ── Literal exceptions: the primary action on a surface ───────────────────────────

  "app/(signed-in)/import/import-surface.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "'Choose your file' — the one primary action on the import surface",
  },
  "app/(signed-in)/lists/create-list-form.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "'New list' submit — the one primary action on the Lists surface",
  },
  "app/(signed-in)/search/catalogue-result.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason: "the Add pill — the one primary action a search result offers",
  },

  // ── Literal exceptions: the rail-heading register ──────────────────────────────────

  "app/(signed-in)/up-next/up-next-group.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 2,
    reason:
      "the vertical list's group label and its 'More ›' link — the label register #310 " +
      "left unmigrated; its own docblock cites up-next-phone-rail.tsx's argument",
  },
  "app/(signed-in)/up-next/up-next-phone-rail.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "the rail head's label register — same role as up-next-group.tsx's",
  },
  "app/(signed-in)/up-next/upcoming-surface.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "'Upcoming episodes' — the same rail-head label register",
  },
  "app/(signed-in)/search/recommendation-rail.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "'Because you watched' — the same rail-head label register",
  },

  // ── Literal exceptions: the two amendments §3 already records by number ──────────

  "app/(signed-in)/up-next/landing-pager.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "the 2px rule under the selected pager label — the #251 amendment",
  },
  "app/(signed-in)/up-next/upcoming-films.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "the 'In N days' countdown — the #252 amendment",
  },
  "app/(signed-in)/up-next/upcoming-row.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason: "the 'Tomorrow' / 'In N days' on a coming-up episode — the same countdown the films carry",
  },

  // ── Literal exceptions: everything else, one call site apiece ─────────────────────

  "app/(signed-in)/library/title-hero.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the watched-progress bar fill — its own docblock: 'how far through you are right " +
      "now is the most literal reading of live on this page'",
  },
  "app/poster-progress-bar.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the watched-progress bar drawn on a poster's bottom edge — one component, three " +
      "call sites (the library bill and both of a list's views), which is why the token " +
      "is here and not in any of them. The same role title-hero.tsx's bar spends: the " +
      "bill's Watching state word left the card entirely so this bar could take the " +
      "accent, leaving one accent role on that screen rather than two. Its own docblock " +
      "answers 'across a poster it would be the accent painting artwork', " +
      "which is a rule about the press sweep and not about a 5px rule at the foot.",
  },
  "app/(signed-in)/lists/list-name-form.tsx": {
    meaning: "LITERAL_EXCEPTION",
    tokens: 1,
    reason:
      "the duplicate-name message, shared by create-list-form.tsx and add-to-list-control.tsx " +
      "— its own comment: 'stays --accent … unchanged by the redesign'",
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
    // `errors/recovery-buttons.ts`'s own docblock (line 63) names `text-accent`/`bg-accent`
    // in backticks a few lines above the real declarations. Unstripped, this file would
    // report 13 tokens rather than the 10 the manifest holds it to.
    const stripped = code(source("errors/recovery-buttons.ts"));
    expect(stripped).not.toContain("`text-accent`");
    expect([...stripped.matchAll(ACCENT_TOKEN)]).toHaveLength(
      ACCENT_CALL_SITES["errors/recovery-buttons.ts"].tokens,
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
