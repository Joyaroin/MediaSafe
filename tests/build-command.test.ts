import { describe, expect, it } from "vitest";

import { runBuild, type BuildSteps } from "@/scripts/build";

/**
 * Issue #39: **the migration is the first half of the build command**,
 * so a failed migration fails the build, no deployment is created, and old code keeps
 * serving an unchanged schema. And **migrations deliberately do not run on preview**,
 * where the database is one shared schema-only Neon branch that no PR may move.
 *
 * Both of those are one decision — *does this build migrate?* — and one ordering. This
 * file is where they are held, because neither can be observed from the outside without
 * a real deployment: "no deployment was created" is Vercel's half of the sentence, and
 * all this side of it can promise is that `next build` was never reached.
 *
 * That is the whole reason `runBuild` takes its two halves as callables. The steps it
 * really runs — the migration runner production runs, and `next build` — are wired in
 * `scripts/build.ts`'s CLI entry, and the ordering between them is asserted here in
 * milliseconds instead of in a deployment nobody can roll back.
 */

/** Records the order the halves ran in, which is the property under test. */
function recorder(overrides: Partial<BuildSteps> = {}) {
  const ran: string[] = [];
  const steps: BuildSteps = {
    migrate: async () => {
      ran.push("migrate");
    },
    build: async () => {
      ran.push("build");
    },
    ...overrides,
  };
  return { ran, steps };
}

describe("the build command", () => {
  it("migrates before building, on a production deployment", async () => {
    const { ran, steps } = recorder();

    await runBuild({ VERCEL: "1", VERCEL_ENV: "production" }, steps);

    expect(ran).toEqual(["migrate", "build"]);
  });

  it("does not build when the migration fails", async () => {
    const { ran, steps } = recorder({
      migrate: async () => {
        throw new Error("relation \"title\" already exists");
      },
    });

    await expect(
      runBuild({ VERCEL: "1", VERCEL_ENV: "production" }, steps),
    ).rejects.toThrow(/already exists/);

    // The whole safety property, in one assertion. `next build` never ran, so there is
    // no build output, so Vercel creates no deployment, so the previous one keeps
    // serving — against the schema the rolled-back migration left exactly as it was.
    expect(ran).toEqual([]);
  });

  it("builds a preview without migrating it", async () => {
    const { ran, steps } = recorder();

    await runBuild({ VERCEL: "1", VERCEL_ENV: "preview" }, steps);

    // The accepted cost of #18's one shared schema-only branch: a schema-changing PR
    // has a broken preview and is verified locally. A preview that migrated would move
    // that branch under every other open PR.
    expect(ran).toEqual(["build"]);
  });

  it("builds locally without migrating, where there is no VERCEL_ENV at all", async () => {
    const { ran, steps } = recorder();

    // `npm run build` on a laptop. Local migrations are `npm run db:migrate`, run
    // deliberately, and a build that quietly migrated the database you develop against
    // would be a surprise rather than a convenience.
    await runBuild({}, steps);

    expect(ran).toEqual(["build"]);
  });

  it("refuses to build on Vercel when the environment is unreadable", async () => {
    const { ran, steps } = recorder();

    // Fail closed, not open. If `VERCEL_ENV` ever stops being set — a platform change,
    // a misconfigured build — then treating the unknown as "not production" would ship
    // new code against an un-migrated schema, which is precisely what the ordering
    // above exists to prevent. Refusing costs a failed build; the alternative costs the
    // production database.
    await expect(runBuild({ VERCEL: "1" }, steps)).rejects.toThrow(/VERCEL_ENV/);

    expect(ran).toEqual([]);
  });

  it("refuses to build on Vercel for an environment it does not know", async () => {
    const { ran, steps } = recorder();

    // There is no staging — two long-lived environments. A third name
    // appearing here means the deployment model changed, and this file is the place
    // that has to be told, rather than the place that guesses.
    await expect(
      runBuild({ VERCEL: "1", VERCEL_ENV: "staging" }, steps),
    ).rejects.toThrow(/staging/);

    expect(ran).toEqual([]);
  });
});
