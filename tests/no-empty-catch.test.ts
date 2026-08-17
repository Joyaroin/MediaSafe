import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";

import noEmptyCatch from "@/eslint-rules/no-empty-catch.mjs";

/**
 * SPEC.md §3.2, machine-checked rather than remembered:
 * **no `catch` returns `[]`.**
 *
 * This is the same argument SPEC.md §6 makes for the route-manifest check. A constraint
 * that everyone agrees with and nobody can see being broken is not a constraint, it is a
 * hope — and this particular one is broken by writing the most natural line of error
 * handling in JavaScript. `tvtracker` broke it, and a failed read became indistinguishable
 * from an empty library for as long as that app existed.
 *
 * It is an **ESLint rule and not a test** because of where each one runs. SPEC.md §6 puts
 * typecheck, lint and build in CI and nothing else; a vitest assertion would never run on
 * a pull request. `npm run lint` does.
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

ruleTester.run("no-empty-catch", noEmptyCatch, {
  valid: [
    // The shape the constraint asks for: a read that fails, throws, and reaches the
    // boundary in `app/error.tsx`.
    "try { rows = await read() } catch (error) { throw error }",
    // An empty array away from any handler is just an empty array.
    "const nothing = []",
    "async function read() { return (await query()).rows ?? [] }",
    // A genuinely empty *success* — the only way an empty state is reachable.
    "const titles = await read(); if (titles.length === 0) { showEmptyLibrary() }",
    // Reporting from a catch is the point; only manufacturing rows is not.
    "try { save() } catch (error) { captureException(error); throw error }",
    "read().catch((error) => { throw error })",
    // A rejection handler that reports and rethrows, with an array that is not a result.
    "read().catch((error) => { report(error); throw error })",
  ],
  invalid: [
    {
      code: "async function read() { try { return await query() } catch { return [] } }",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
    {
      code: "try { rows = await read() } catch (error) { rows = [] }",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
    // The wrapper does not matter — a cast, a parenthesis or an object around it is the
    // same lie told with more syntax.
    {
      code: "async function read() { try { return await query() } catch { return { titles: [], count: 0 } } }",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
    // The promise form, which is how it usually arrives.
    {
      code: "const titles = await read().catch(() => [])",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
    {
      code: "const titles = await read().catch(function () { return [] })",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
    // `then`'s second argument is a rejection handler wearing another name.
    {
      code: "const titles = await read().then((rows) => rows, () => [])",
      errors: [{ messageId: "emptyResultFromFailure" }],
    },
  ],
});

describe("the rule as the repository actually runs it", () => {
  const eslint = new ESLint();

  it("is enabled by eslint.config.mjs, so `npm run lint` enforces it", async () => {
    const [result] = await eslint.lintText(
      "export async function read(): Promise<string[]> {\n" +
        "  try {\n" +
        "    return await query();\n" +
        "  } catch {\n" +
        "    return [];\n" +
        "  }\n" +
        "}\n",
      { filePath: "errors/a-file-that-is-not-on-disk.ts" },
    );

    expect(result.messages.map((message) => message.ruleId)).toContain(
      "mediasafe/no-empty-catch",
    );
  });

  it("leaves a throwing catch alone", async () => {
    const [result] = await eslint.lintText(
      "export async function read(): Promise<string[]> {\n" +
        "  try {\n" +
        "    return await query();\n" +
        "  } catch (error) {\n" +
        "    throw error;\n" +
        "  }\n" +
        "}\n",
      { filePath: "errors/a-file-that-is-not-on-disk.ts" },
    );

    expect(result.messages.map((message) => message.ruleId)).not.toContain(
      "mediasafe/no-empty-catch",
    );
  });
});
