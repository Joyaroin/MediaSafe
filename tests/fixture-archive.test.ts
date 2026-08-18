import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The `tvtracker` rescue archive, machine-checked (issue #60).
 *
 * `fixtures/` holds the only surviving copy of `tvtracker`'s database. The source
 * repository and its Supabase project are being deleted, and #60 established there is no
 * third copy and no way to regenerate one — so every property this archive is supposed to
 * have is asserted here rather than remembered.
 *
 * Three properties, and they fail for three different reasons:
 *
 *  1. **The bytes are the bytes.** Both archives decompress and hash to the values
 *     `fixtures/README.md` records. A silent corruption in an irreplaceable file is the
 *     failure with no recovery, so it is checked rather than assumed.
 *  2. **No Supabase auth row survived the redaction.** #60 decided the `auth` schema —
 *     live refresh tokens, OAuth identities, two real email addresses — does not enter
 *     this repository's history. Git history is permanent; this is what notices if a
 *     future re-import puts them back.
 *  3. **Nothing loads it.** The archive is *archived and never loaded*. No application
 *     code, test, seeding path or CI step may read it, and step 3's conversion script
 *     will be the first thing that ever does.
 *
 * **This file is the one exception to property 3** — it reads the archive in order to
 * check it, which is why it excludes itself from its own scan below.
 */

const REPO = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(REPO, "fixtures");

const DATA = "tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz";
const SCHEMA = "tvtracker-2026-08-16T04-27-53Z-schema.sql.gz";

/**
 * Checksums of the *decompressed* SQL, not of the `.gz`.
 *
 * gzip output depends on the compressor — level, implementation, embedded mtime — so a
 * hash of the container would fail the day anyone recompressed the identical bytes, and
 * would be reporting a difference that does not exist. The payload is the thing that is
 * irreplaceable, so the payload is what is pinned.
 */
const SHA256 = {
  [DATA]: "f12954041a76c1ee2af407ba912374c4c7f48d810f56967a3e1f90eff97a4716",
  [SCHEMA]: "80c2c941619d9daba628ea8233c5c400ee880d2f83467001ffe605e33e429314",
} as const;

/** Row counts of the `public` tables the redaction had to leave completely alone. */
const PUBLIC_ROWS = { shows: 472, episode_overrides: 18649 } as const;

/** Every `auth` table that had rows, and how many were removed from each. */
const REDACTED = {
  flow_state: 2,
  users: 2,
  identities: 2,
  sessions: 2,
  mfa_amr_claims: 2,
  refresh_tokens: 7,
} as const;

function sql(archive: string): string {
  return gunzipSync(readFileSync(path.join(FIXTURES, archive))).toString("utf8");
}

/**
 * Index just past the single-quoted literal starting at `open`.
 *
 * Doubled quotes are the only escape to handle — the dump sets
 * `standard_conforming_strings = on`, so a backslash inside a literal is a backslash.
 */
function endOfLiteral(text: string, open: number): number {
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === "'") {
      if (text[i + 1] === "'") i += 2;
      else return i + 1;
    } else {
      i++;
    }
  }
  return i;
}

/**
 * The single `INSERT` statement for a table, from `INSERT` to its terminating `;`.
 *
 * Stopping at the semicolon is load-bearing rather than tidy. Slicing to end-of-file
 * instead makes `shows` swallow `episode_overrides`, and makes `episode_overrides`
 * swallow the trailing `setval('"auth"."refresh_tokens_id_seq"', 124, true)` — whose
 * argument list is one more top-level `(...)` group and so reports one row too many.
 */
function insertStatement(text: string, schema: string, table: string): string | undefined {
  const start = text.indexOf(`INSERT INTO "${schema}"."${table}"`);
  if (start < 0) return undefined;

  for (let i = start; i < text.length; i++) {
    if (text[i] === "'") {
      i = endOfLiteral(text, i) - 1;
      continue;
    }
    if (text[i] === ";") return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/**
 * Count top-level `(...)` groups after `VALUES`, respecting quoted strings.
 *
 * A line-based count is wrong here and quietly so: `shows.overview` carries TMDB
 * synopses containing literal newlines, so counting indented lines reports 457 rows for
 * a table that has 472. That undercount is what this function exists to avoid.
 */
function countRows(statement: string): number {
  const values = /\bVALUES\b/.exec(statement);
  if (!values) return 0;

  let rows = 0;
  let depth = 0;
  for (let i = values.index + values[0].length; i < statement.length; i++) {
    const c = statement[i];
    if (c === "'") {
      i = endOfLiteral(statement, i) - 1;
      continue;
    }
    if (c === "(") {
      if (depth === 0) rows++;
      depth++;
    } else if (c === ")") {
      depth--;
    }
  }
  return rows;
}

describe("the tvtracker rescue archive is intact", () => {
  it.each(Object.entries(SHA256))(
    "%s decompresses and matches its recorded checksum",
    (archive, expected) => {
      expect(createHash("sha256").update(sql(archive)).digest("hex")).toBe(expected);
    },
  );

  it.each(Object.entries(PUBLIC_ROWS))("public.%s still holds all %d rows", (table, expected) => {
    const statement = insertStatement(sql(DATA), "public", table);
    expect(statement, `public.${table} is missing from the archive`).toBeDefined();
    expect(countRows(statement!)).toBe(expected);
  });
});

describe("no Supabase auth row is in this repository", () => {
  it("the data archive contains no auth-schema INSERT", () => {
    expect(sql(DATA)).not.toContain('INSERT INTO "auth"');
  });

  it("carries no email address", () => {
    // The dump's only email addresses were the two in auth.users and the OAuth
    // identity_data JSON beside them. Nothing in `public` holds one.
    expect(sql(DATA)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it.each(Object.entries(REDACTED))(
    "names auth.%s and the %d row(s) taken out of it",
    (table, rows) => {
      expect(sql(DATA)).toContain(`-- REDACTED — auth.${table}: ${rows} row(s) removed`);
    },
  );

  /**
   * The schema half is committed **unmodified**, and that is a decision rather than an
   * oversight: it declares no `auth` object and stores no credential. It only references
   * `auth.users` in four foreign keys and `auth.uid()` in the RLS policies — structure,
   * which is the half of the export worth keeping legible.
   */
  it("the schema archive declares no auth object, only references", () => {
    const text = sql(SCHEMA);
    expect(text).toMatch(/REFERENCES "auth"\."users"/);
    expect(text).not.toMatch(/CREATE (TABLE|SCHEMA)[^;]*"auth"\./);
    expect(text).not.toMatch(/INSERT INTO "auth"/);
  });
});

describe("nothing loads the archive", () => {
  /**
   * Greps the tracked tree rather than a hand-written list of directories, so a loader
   * added in a directory that does not exist yet is still caught. `git grep` sees only
   * tracked files, which is the right scope: an untracked local scratch script is not
   * something this repository ships.
   *
   * Three exclusions, each for a different reason:
   *
   *  - `fixtures/` — the archive and the note that documents it.
   *  - `*.md` — the docs are *required* to name it (#60 asks that it be findable without
   *    reading the ticket), so a prose mention is the goal here, not the violation.
   *  - this file — it reads the archive in order to check it, and a rule that catches its
   *    own enforcement catches nothing else.
   *
   * What is left is every file that could actually execute: TypeScript, config, CI
   * workflows, `package.json`. **When step 3's conversion script arrives it will fail
   * this test**, and that is the intended moment to revisit it — the archive stops being
   * never-loaded exactly then, deliberately and in a diff.
   */
  it("no executable tracked file names either archive", () => {
    let hits: string;
    try {
      hits = execFileSync(
        "git",
        [
          "grep", "-l", "-F", "-e", DATA, "-e", SCHEMA,
          "--", ":!fixtures/", ":!*.md", ":!tests/fixture-archive.test.ts",
        ],
        { cwd: REPO, encoding: "utf8" },
      );
    } catch (error) {
      // `git grep` exits 1 with no output when nothing matched. That is the passing
      // case, and it is the only failure swallowed here — anything else rethrows, so a
      // broken invocation cannot masquerade as a clean result.
      const failure = error as { status?: number; stdout?: string };
      if (failure.status !== 1) throw error;
      hits = failure.stdout ?? "";
    }
    expect(hits.trim().split("\n").filter(Boolean)).toEqual([]);
  });
});
