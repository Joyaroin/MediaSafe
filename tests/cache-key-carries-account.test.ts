import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";

import cacheKeyCarriesAccount from "@/eslint-rules/cache-key-carries-account.mjs";

/**
 * The read-cache clause as amended by issue #219, machine-checked rather than remembered:
 * **no cache key without an account.**
 *
 * The argument is `tests/no-empty-catch.test.ts`'s, one constraint over. A cache is only
 * allowed into this codebase because two properties hold — every key carries an account,
 * every write busts its tags — and a property that everyone agrees with and nobody can
 * see being broken is not a property, it is a hope. This one is worse than most if it
 * goes: a key that lost its account does not misrender, it serves one reader another
 * reader's library, consistently, until something busts it.
 *
 * It is an **ESLint rule and not a test** for the reason the empty-catch rule gives:
 * CI runs typecheck, lint and build and nothing else, so a vitest
 * assertion would never see a pull request and `npm run lint` will.
 *
 * What this file tests is the rule itself — that it fires on the shapes it must, holds
 * its fire on the shapes it must not, and is actually wired into the repository's config.
 * A static check that silently matches nothing passes for ever, which is the one failure
 * mode a static check has.
 */

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("cache-key-carries-account", cacheKeyCarriesAccount, {
  valid: [
    // The shape `cache/tags.ts` actually writes.
    'const read = unstable_cache(listLibraryEntries, ["library", userId], { tags: [tagFor("library", userId)] })',
    // The account can be buried in an expression; the rule walks for it rather than
    // matching one spelling, because there is more than one honest way to write this.
    'unstable_cache(read, ["library", `${userId}`], {})',
    "unstable_cache(read, [session.userId], {})",
    // `cacheTag`, the Cache Components spelling, covered against the day it is used.
    'cacheTag(`library:${userId}`)',
    'cacheTag("library", userId)',
    // Not a cache call at all. The rule is not a general-purpose search for `userId`.
    'listLibraryEntries(userId, "recently-added")',
    "updateTag(tag)",
  ],
  invalid: [
    {
      // The leak. Every reader hashes to the same key, so the first one's library is
      // served to all of them.
      code: 'unstable_cache(listLibraryEntries, ["library"], { tags: ["library"] })',
      errors: [{ messageId: "keyPartsWithoutAccount" }],
    },
    {
      // Worse than the above and easier to write: with no key parts at all the key is
      // the callback's source text, which is identical for every reader.
      code: "unstable_cache(listLibraryEntries)",
      errors: [{ messageId: "keyPartsMissing" }],
    },
    {
      // Rejected rather than analysed. The rule has no type information and cannot follow
      // a variable, and the conservative direction on a question about account isolation
      // is to refuse.
      code: "unstable_cache(listLibraryEntries, keyParts, {})",
      errors: [{ messageId: "keyPartsNotLiteral" }],
    },
    {
      code: 'cacheTag("library")',
      errors: [{ messageId: "tagWithoutAccount" }],
    },
  ],
});

describe("the rule as the repository actually runs it", () => {
  const eslint = new ESLint();

  it("is enabled by eslint.config.mjs, so `npm run lint` enforces it", async () => {
    const [result] = await eslint.lintText(
      'const read = unstable_cache(listLibraryEntries, ["library"], {\n' +
        '  tags: ["library"],\n' +
        "});\n",
      { filePath: "cache/a-file-that-is-not-on-disk.ts" },
    );

    expect(result.messages.map((message) => message.ruleId)).toContain(
      "mediasafe/cache-key-carries-account",
    );
  });

  it("leaves an account-scoped key alone", async () => {
    const [result] = await eslint.lintText(
      'const read = unstable_cache(listLibraryEntries, ["library", userId], {\n' +
        '  tags: [tagFor("library", userId)],\n' +
        "});\n",
      { filePath: "cache/a-file-that-is-not-on-disk.ts" },
    );

    expect(result.messages.map((message) => message.ruleId)).not.toContain(
      "mediasafe/cache-key-carries-account",
    );
  });

  /**
   * The other half of the boundary, and a rule rather than a habit for the same reason:
   * the two properties above are properties of `cache/tags.ts`, and they say nothing
   * about a page that reached for `unstable_cache` itself. So no page can.
   */
  it("keeps next/cache out of every file but cache/", async () => {
    const [outside] = await eslint.lintText(
      'import { unstable_cache } from "next/cache";\n',
      { filePath: "app/a-file-that-is-not-on-disk.ts" },
    );

    expect(outside.messages.map((message) => message.ruleId)).toContain(
      "no-restricted-imports",
    );

    const [inside] = await eslint.lintText(
      'import { unstable_cache } from "next/cache";\n',
      { filePath: "cache/a-file-that-is-not-on-disk.ts" },
    );

    expect(inside.messages.map((message) => message.ruleId)).not.toContain(
      "no-restricted-imports",
    );
  });
});
