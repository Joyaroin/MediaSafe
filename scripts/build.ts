import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * The build command Vercel runs, and the ordering that makes `main`-is-production safe.
 *
 * **The migration is the first half of the build command** (`SPEC.md` §6, issue #39).
 * That ordering is the whole safety property. A migration that fails fails the build,
 * so `next build` never runs, so there is no build output, so Vercel creates no
 * deployment, so the previous one keeps serving — against the schema the rolled-back
 * migration left unchanged. Drizzle's migrator wraps the entire pending run in one
 * transaction, so "unchanged" is literal; see the note at the top of `db/migrate.ts`.
 *
 * Run the other way round — migrate after a successful build — and you get new schema
 * under old code, or old schema under new code, with nothing in the pipeline able to
 * stop either. There is no staging here to catch it and no branch protection to gate
 * the merge, so this ordering is the only thing standing where those would.
 *
 * **Migrations do not run on preview.** A PR gets a Vercel preview against one shared
 * schema-only Neon branch holding zero production rows
 * ([#18](https://github.com/Joyaroin/MediaSafe/issues/18)). One branch, every open PR.
 * If previews migrated, whichever PR built last would move that branch under all the
 * others, and a migration nobody merged would be applied to something long-lived. The
 * accepted cost, decided knowingly, is that a schema-changing PR has a broken preview
 * and is verified locally instead.
 *
 * Wired in `vercel.json` as `buildCommand`, so there is one build command rather than a
 * dashboard setting that disagrees with the repository.
 */

/** The two halves, injected so `tests/build-command.test.ts` can assert their order. */
export interface BuildSteps {
  migrate: () => Promise<void>;
  build: () => Promise<void>;
}

/**
 * The two variables the decision reads, and no more.
 *
 * Deliberately not `NodeJS.ProcessEnv`: that type demands `NODE_ENV`, so
 * `tests/build-command.test.ts` would have to supply a variable this never looks at in
 * every case. Naming the two that matter states the dependency instead of inheriting the
 * whole environment.
 *
 * Note that `process.env` is *not* assignable to this — TypeScript's weak-type check
 * rejects it, since `ProcessEnv` declares only an index signature and so has no property
 * in common with it. That is why the CLI entry at the bottom reads the two out by name
 * rather than passing `process.env` through, and it is the better shape anyway: the
 * dependency is two lines of code instead of a cast.
 */
export interface BuildEnvironment {
  /** Set to `"1"` by Vercel on every build it runs, and by nothing else. */
  VERCEL?: string;
  /** `production`, `preview` or `development`. */
  VERCEL_ENV?: string;
}

/**
 * The three deployment environments Vercel names. `development` is `vercel dev`, which
 * nothing here uses — local development is Docker Postgres and `next dev` — but it is
 * a name Vercel can legitimately set, so it is known-and-skipped rather than rejected.
 */
const KNOWN_VERCEL_ENVIRONMENTS = ["production", "preview", "development"] as const;

type VercelEnvironment = (typeof KNOWN_VERCEL_ENVIRONMENTS)[number];

function isKnownEnvironment(value: string): value is VercelEnvironment {
  return (KNOWN_VERCEL_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Decides whether this build migrates first.
 *
 * Off Vercel — a laptop running `npm run build` — the answer is no, and quietly: local
 * migrations are `npm run db:migrate`, run deliberately against the database you
 * develop in, and a build that migrated it as a side effect would be a surprise.
 *
 * On Vercel the answer comes from `VERCEL_ENV` alone, and an environment this does not
 * recognise **throws rather than defaulting to no**. Fail closed: treating an unreadable
 * environment as "not production" would ship new code against an un-migrated schema,
 * which is the exact failure the ordering above exists to prevent. A refused build costs
 * one red deployment; the alternative costs the production database.
 */
function migrationsRunFor(env: BuildEnvironment): boolean {
  if (!env.VERCEL) return false;

  const vercelEnv = env.VERCEL_ENV;
  if (!vercelEnv) {
    throw new Error(
      "VERCEL_ENV is not set on a Vercel build. Refusing to build rather than guess: " +
        "guessing wrong deploys new code against an un-migrated schema.",
    );
  }
  if (!isKnownEnvironment(vercelEnv)) {
    throw new Error(
      `VERCEL_ENV is "${vercelEnv}", which this build command does not know. ` +
        `Expected one of: ${KNOWN_VERCEL_ENVIRONMENTS.join(", ")}. ` +
        "If the deployment model gained an environment, scripts/build.ts is what has to be told.",
    );
  }

  return vercelEnv === "production";
}

/**
 * Runs the build: the migration first when this environment migrates, then `next build`.
 *
 * Throws on either half. Nothing is caught and nothing is reported as partial success —
 * the caller's only job is to turn a rejection into a non-zero exit code, which is what
 * Vercel reads.
 */
export async function runBuild(
  env: BuildEnvironment,
  steps: BuildSteps,
): Promise<void> {
  if (migrationsRunFor(env)) {
    // No `try`. A rejection here propagates and `steps.build` below is never reached,
    // which is the entire point of the ordering.
    await steps.migrate();
  }

  await steps.build();
}

/** Runs a command, inheriting stdio so its output is the build log Vercel shows. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

/** True when this module was executed directly rather than imported. */
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntry()) {
  const steps: BuildSteps = {
    migrate: async () => {
      console.log("[build] migrating production before building");
      // Imported here rather than at the top of the file, so a preview build — and
      // anything importing this module for `runBuild` — never loads the database driver
      // to run a step it is not going to take.
      const { runMigrations } = await import("../db/migrate");
      await runMigrations();
      console.log("[build] migrations up to date");
    },
    // `--no` so a missing `next` is a loud failure rather than a silent download, and
    // `--` so npx hands the rest to `next` instead of reading it as its own flags —
    // without the separator, `npx --no next --version` prints npm's version.
    build: () => run("npx", ["--no", "--", "next", "build"]),
  };

  // Read out by name rather than handing over the whole of `process.env`, so what this
  // command depends on is two lines of code instead of a type assertion.
  const env: BuildEnvironment = {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  runBuild(env, steps).catch((error: unknown) => {
    console.error("[build] failed. No deployment is created from a failed build.");
    console.error(error);
    process.exitCode = 1;
  });
}
