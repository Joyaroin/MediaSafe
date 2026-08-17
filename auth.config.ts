/* eslint-disable no-restricted-imports --
 * Both imports. This file exists to be read by the Better Auth CLI, which regenerates
 * `auth-schema.ts` from the options below — reading them is the whole of its job. It
 * resolves no session and constructs no instance; see the note in `lib/auth.ts` on why
 * nothing else may import it.
 */
import type { BetterAuthOptions } from "better-auth";

import { authOptions } from "@/lib/auth";

/**
 * The Better Auth CLI's entry point, and nothing else's.
 *
 * `npm run auth:generate` reads exactly one thing from this file: an export named `auth`
 * carrying an `options` property. It never constructs the instance, never connects, and
 * never awaits anything — it diffs the options against `auth-schema.ts` and rewrites the
 * file. `--adapter drizzle --dialect postgresql` on the command line is what tells it the
 * shape to write without a database to ask.
 *
 * ── Why this is not `lib/auth.ts` ────────────────────────────────────────────────────
 *
 * The CLI probes `lib/auth.ts` on its own and would find it. What it wants there is a
 * live `betterAuth()` instance exported as `auth` — and building one at module scope is
 * the exact thing `lib/auth.ts` explains at length that it must not do, because
 * `betterAuth()` starts an async init that resolves the pool. That would put a database
 * connection behind a schema generator, behind `next build`, and behind every test that
 * imports the module.
 *
 * So the options are the export, and this file is the shape the CLI asks for wrapped
 * around them. It is deliberately the only thing here: no second copy of the config, and
 * nothing that could drift from what the application actually runs, because it is the
 * same object.
 */
export const auth = { options: authOptions } satisfies { options: BetterAuthOptions };
