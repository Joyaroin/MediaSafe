<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The error discipline

`SPEC.md` §3 holds eight constraints. Two of them bite on every read and every write you
will ever add to this codebase, so they are here rather than only there.

## No `catch` returns `[]`

**Empty and failed are structurally separate.** A read that fails throws. An empty state is
reachable only by a query that succeeded and found nothing.

```ts
// No.
try {
  return await listLibraryEntries(userId);
} catch {
  return [];
}

// Yes — there is no `try` at all. The boundary in `app/error.tsx` is what catches this.
return await listLibraryEntries(userId);
```

This is not a style preference and it is not about arrays. It is the rule that keeps *the
database is down* from rendering as *you have no titles*. `tvtracker` broke it once, and a
failed read was indistinguishable from an empty library for the whole life of that app.

The same lie has other spellings, and they are all covered: `.catch(() => [])`,
`.then(rows => rows, () => [])`, `catch { rows = [] }`, `catch { return { titles: [] } }`.

**It is enforced, not remembered.** `mediasafe/no-empty-catch` in `eslint.config.mjs` fails
`npm run lint`, which is one of the three things CI runs. If you have a case the rule is
wrong about, disable it on the line *with a reason* — and expect that reason to be read.

Catching in order to **report and rethrow** is fine and always was. What the rule forbids is
manufacturing a successful-looking empty result out of a failure.

## Errors are placed by blast radius

Four treatments, four placements, and they are not interchangeable (`DESIGN.md`, States, and
`SPEC.md` §6 — *read inline, write toast, auth full-page*). The mechanisms exist already — build
the caller, not a fifth surface.

| Blast radius | Treatment | Where it lives |
| --- | --- | --- |
| One region failed to load | Inline, replacing that region | `app/error.tsx` → `errors/read-failure.tsx` |
| One write was lost | A toast that does not auto-dismiss | `writeFailures.raise()` in `errors/write-failure.ts` |
| A sign-in did not happen | Full-page, on the sign-in surface | `errors/sign-in-failure.tsx` |
| The whole app is unreachable | A sticky banner at the top of the page | `errors/offline-banner.tsx` |

The auth row was the one `SPEC.md` §6 named and nothing implemented until issue #42, and it is
full-page for a specific reason: a signed-out reader has one control and no other surface to be
told anything on, so a failure that is not full-page is a failure that is nowhere. `tvtracker`
rendered no auth error at all.

Two rules over all four:

- **Every user-facing string is a plain sentence.** No stack trace, no error code, no
  exception message, no HTTP status. The toast's API takes a title and an episode and
  writes its own sentences, precisely so there is no parameter an exception could arrive in.
- **The one technical string allowed anywhere is the reference id, and it *is* the Sentry
  event id.** Get it from `referenceFor()` in `errors/reference.ts`. Never mint a second
  identifier that then has to be correlated with Sentry — that is the thing this avoids.

## `auth-schema.ts` is generated. Never edit it.

Better Auth's five tables live in `auth-schema.ts`, which `npm run auth:generate` **overwrites
whole**, and which `db/schema.ts` re-exports so drizzle-kit sees one schema and emits one
migration history.

A column added to that file by hand survives exactly until the next regeneration. It then
disappears from the schema drizzle-kit diffs against, and the *next* migration drops it — taking
the data with it. So a column on `user`, `session`, `account`, `verification` or `rate_limit` is
declared in `lib/auth.ts` as a Better Auth `additionalFields` entry, where regeneration reproduces
it. `user.timezone` is the worked example.

MediaSafe's own six tables are declared by hand in `db/tables.ts`, and the three derived-state
views in `db/views.ts`; `db/schema.ts` re-exports all three files, because drizzle-kit reads it
alone. Only Better Auth's tables come through the generator.

## The write-failure toast has no caller yet

Nothing in the app writes. Step 4 of `SPEC.md` §11's build order — the optimistic watch
mark and its rollback — is the first, and the toast was built ahead of it on purpose. When
you get there, `raise()` it and `resolve()` it when the write lands. Do not add a timer to
it: *a lost write is never silent* (§3.3) is the property, and a toast that expires on its
own makes the write silent again a few seconds later.
