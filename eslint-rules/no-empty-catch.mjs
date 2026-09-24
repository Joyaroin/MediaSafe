/**
 * Constraint 2, made mechanical: **no `catch` returns `[]`.**
 *
 * Empty and failed are structurally separate. A read that fails throws, and reaches the
 * boundary in `app/error.tsx`; an empty state is reachable only by a query that succeeded
 * and found nothing. The line that collapses the two is the most natural line of error
 * handling in JavaScript, which is why this is a lint rule and not a paragraph — the
 * paragraph is in `AGENTS.md`, and `tvtracker` had one too.
 *
 * The rule flags an empty array literal only where it is being **produced as a result**
 * from a failure handler: returned, assigned, or the body of a handler arrow. An empty
 * array passed as an argument from inside a `catch` — `captureException(error, { tags:
 * [] })` — is not a manufactured result and is left alone.
 *
 * A failure handler is a `catch` clause, the argument to `.catch()`, or the second
 * argument to `.then()`.
 *
 * **What it does not catch**, so nobody mistakes a clean lint run for a proof: an empty
 * array that reaches the handler through a variable (`const none = []` outside, `catch {
 * return none }`), one returned by a function the handler calls, and a `catch` that
 * swallows the error and falls through to a caller's own empty default. This rule closes
 * the spelling that gets written by accident; the reasoning in `AGENTS.md` is what closes
 * the rest.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const noEmptyCatch = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow manufacturing an empty array from a failure handler, which makes a failed read indistinguishable from an empty one.",
    },
    schema: [],
    messages: {
      emptyResultFromFailure:
        "No `catch` returns `[]`. A failed read must throw so the error boundary catches it — an empty array here makes failure indistinguishable from an empty library. Rethrow, or return a value that says the read failed.",
    },
  },

  create(context) {
    /**
     * Syntax that wraps a value without changing that it is the value being produced.
     * `return [] as Title[]`, `return { titles: [] }` and `return ok ? rows : []` are all
     * the same statement with more punctuation.
     */
    const VALUE_WRAPPERS = new Set([
      "ArrayExpression",
      "ChainExpression",
      "ConditionalExpression",
      "LogicalExpression",
      "ObjectExpression",
      "Property",
      "SequenceExpression",
      "TSAsExpression",
      "TSNonNullExpression",
      "TSSatisfiesExpression",
      "TSTypeAssertion",
    ]);

    const FUNCTIONS = new Set([
      "ArrowFunctionExpression",
      "FunctionDeclaration",
      "FunctionExpression",
    ]);

    /** Is this function the handler a promise runs when it rejects? */
    function isRejectionHandler(fn) {
      const call = fn.parent;
      if (!call || call.type !== "CallExpression") return false;
      if (call.callee.type !== "MemberExpression" || call.callee.computed) return false;

      const method = call.callee.property.name;
      if (method === "catch") return call.arguments[0] === fn;
      if (method === "then") return call.arguments[1] === fn;
      return false;
    }

    return {
      ArrayExpression(node) {
        if (node.elements.length > 0) return;

        // Climb out of any syntax that merely wraps the value.
        let value = node;
        while (value.parent && VALUE_WRAPPERS.has(value.parent.type)) {
          value = value.parent;
        }

        // Is this value actually being produced, rather than passed somewhere?
        const parent = value.parent;
        if (!parent) return;

        let produced;
        if (parent.type === "ReturnStatement") {
          produced = parent;
        } else if (parent.type === "AssignmentExpression" && parent.right === value) {
          produced = parent;
        } else if (
          parent.type === "ArrowFunctionExpression" &&
          parent.body === value
        ) {
          produced = parent;
        } else {
          return;
        }

        // Walk out to whatever handles the failure. The first function boundary decides:
        // an inner function that happens to sit inside a `catch` is its own scope, and
        // returning `[]` from it says nothing about the failed read.
        let scope = produced;
        while (scope) {
          if (scope.type === "CatchClause") {
            context.report({ node, messageId: "emptyResultFromFailure" });
            return;
          }
          if (FUNCTIONS.has(scope.type)) {
            if (isRejectionHandler(scope)) {
              context.report({ node, messageId: "emptyResultFromFailure" });
            }
            return;
          }
          scope = scope.parent;
        }
      },
    };
  },
};

export default noEmptyCatch;
