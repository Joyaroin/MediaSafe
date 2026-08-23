/**
 * The read cache's first property, made mechanical: **no cache key without an account.**
 *
 * `cache/tags.ts` holds the reasoning. In one line of it: the reversal of `SPEC.md` §3
 * constraint 1's read-cache clause keeps *two reads of the same fact cannot disagree*
 * only while every key is scoped to the reader it was read for, and a key that is not is
 * one account being served another account's library. There is no row-level security
 * behind it to catch that (`SPEC.md` §6), and a cache entry outlives the request that
 * made it, so it is not even the kind of leak a reader would report as a wrong page — it
 * is the wrong library, served consistently.
 *
 * The rule fires on the two ways this codebase can key a cached read:
 *
 *  - **`unstable_cache(cb, keyParts, options)`** — today's mechanism. `keyParts` must be
 *    an array literal, and something in it must name an account. A missing second
 *    argument is the worst case rather than a lenient one: the key is then the callback's
 *    source text alone, which is identical for every reader.
 *  - **`cacheTag(...)`** — the Cache Components mechanism this app does not use yet
 *    (`cacheComponents` is off in `next.config.ts`, and turning it on is a whole-app
 *    migration, not this ticket). It is covered anyway, so that the day somebody migrates
 *    is not the day the rule silently stops applying.
 *
 * **What "names an account" means, exactly.** The rule looks for the identifier `userId`
 * — bare, as a property, or anywhere inside a larger expression, so
 * `` `library:${userId}` `` and `tagFor(read, userId)` both pass. That is a name check,
 * not a type check: ESLint here has no type information, and the thing that makes the
 * name true is `UserId`, the branded type every one of these values carries
 * (`db/access.ts`). The rule closes the case that gets written by accident — a key built
 * out of the entity alone — rather than proving anything about the value behind the name.
 *
 * **What it does not catch**, so a clean lint run is not mistaken for a proof:
 *
 *  - A key part that reaches the array through a variable (`const parts = [read]`) is
 *    rejected outright rather than analysed, which is the conservative direction.
 *  - **A renamed import.** The rule matches the callee's *name*, so
 *    `import { unstable_cache as uc } from "next/cache"` walks straight past it. That hole
 *    is closed from the other side rather than here: `eslint.config.mjs` restricts
 *    `next/cache` to `cache/` entirely, so the only file that can write such an import is
 *    the one file whose whole subject is this, and a rename there would be a line somebody
 *    chose to write. Closing it here instead would mean resolving imports, which this rule
 *    cannot do and which the restriction already does better.
 *  - An account-scoped key over a query that forgot its own `user_id` filter is still a
 *    leak this rule cannot see. `ownedBy` in `db/access.ts` is what that one rests on, and
 *    it always was.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const cacheKeyCarriesAccount = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every cache key and cache tag to be scoped to an account, so one reader's cached library can never be served to another.",
    },
    schema: [],
    messages: {
      keyPartsMissing:
        "A cached read needs key parts naming the account it was read for. Without them the key is the callback's source text, which is the same for every reader — so the first reader's library is served to all of them. Pass `[read, userId]` (cache/tags.ts).",
      keyPartsNotLiteral:
        "The key parts of a cached read must be an array literal, so that the account in them can be seen here rather than traced. Build them inline — `[read, userId]` — as cachedLibraryEntries in cache/tags.ts does.",
      keyPartsWithoutAccount:
        "This cache key carries no account, so two readers share one entry and the second is served the first's rows. Add the user id to the key parts (cache/tags.ts).",
      tagWithoutAccount:
        "A cache tag carries an account, always — a tag without one names every reader's entry at once. Build it from the user id (cache/tags.ts).",
    },
  },

  create(context) {
    /**
     * Does this expression name an account anywhere inside it?
     *
     * A walk rather than a shape match, because the honest spellings are several —
     * `userId`, `` `library:${userId}` ``, `tagFor(read, userId)`, `session.userId` — and
     * enumerating them would leave the rule rejecting correct code, which is how a rule
     * ends up disabled at the call sites it most needs to cover.
     */
    function namesAnAccount(node) {
      if (node === null || typeof node !== "object") return false;

      if (node.type === "Identifier" && node.name === "userId") return true;

      for (const key of Object.keys(node)) {
        if (key === "parent") continue;

        const value = node[key];
        if (Array.isArray(value)) {
          if (value.some((child) => namesAnAccount(child))) return true;
        } else if (value !== null && typeof value === "object" && "type" in value) {
          if (namesAnAccount(value)) return true;
        }
      }

      return false;
    }

    /** The callee's own name, whether it is called bare or off an object. */
    function calleeName(callee) {
      if (callee.type === "Identifier") return callee.name;
      if (callee.type === "MemberExpression" && !callee.computed) {
        return callee.property.type === "Identifier" ? callee.property.name : null;
      }
      return null;
    }

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);

        if (name === "cacheTag") {
          if (!node.arguments.some((argument) => namesAnAccount(argument))) {
            context.report({ node, messageId: "tagWithoutAccount" });
          }
          return;
        }

        if (name !== "unstable_cache") return;

        const keyParts = node.arguments[1];

        if (keyParts === undefined) {
          context.report({ node, messageId: "keyPartsMissing" });
          return;
        }

        if (keyParts.type !== "ArrayExpression") {
          context.report({ node: keyParts, messageId: "keyPartsNotLiteral" });
          return;
        }

        if (!keyParts.elements.some((element) => namesAnAccount(element))) {
          context.report({ node: keyParts, messageId: "keyPartsWithoutAccount" });
        }
      },
    };
  },
};

export default cacheKeyCarriesAccount;
