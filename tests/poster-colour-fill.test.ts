import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  fillPosterColours,
  type ExtractPosterColour,
} from "@/app/api/cron/nightly-sweep/fill-poster-colours";
import { refreshTitleMirror, titlesWantingPosterColour, writePosterColour } from "@/db/access";
import type { Transaction } from "@/db/client";
import { title } from "@/db/schema";
import type { TitleMirror } from "@/tmdb/mirror";

import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Issue #361's fill — the backfill and the ongoing writer of `title.poster_colour` —
 * against real Postgres, with a stub extractor so nothing here fetches a poster.
 */

setUpTestDatabase("mediasafe_poster_colour_fill_test");

let counter = 0;
const nextNumber = () => ++counter;

async function seedTitle(
  tx: Transaction,
  seed: { posterPath?: string | null; posterColour?: string | null } = {},
): Promise<{ id: string; tmdbId: number }> {
  const tmdbId = nextNumber();
  const [row] = await tx
    .insert(title)
    .values({
      kind: "film",
      tmdbId,
      name: `Title ${tmdbId}`,
      posterPath: seed.posterPath === undefined ? `/poster-${tmdbId}.jpg` : seed.posterPath,
      posterColour: seed.posterColour ?? null,
    })
    .returning({ id: title.id, tmdbId: title.tmdbId });
  return row;
}

async function colourOf(tx: Transaction, titleId: string): Promise<string | null> {
  const [row] = await tx
    .select({ posterColour: title.posterColour })
    .from(title)
    .where(eq(title.id, titleId));
  return row.posterColour;
}

/** Every poster is the same blue — the stub's colour is not what is under test. */
const blue: ExtractPosterColour = async () => "#1e3cdc";

function filmMirror(tmdbId: number, posterPath: string | null): TitleMirror {
  return {
    kind: "film",
    tmdbId,
    externalId: null,
    name: `Title ${tmdbId}`,
    releaseYear: null,
    releaseDate: null,
    posterPath,
    inProduction: null,
    runtimeMins: null,
    episodes: [],
  };
}

describe("titlesWantingPosterColour", () => {
  it("asks for titles with a poster and no colour, and nothing else", () =>
    inTransaction(async (tx) => {
      const wanting = await seedTitle(tx);
      await seedTitle(tx, { posterPath: null });
      await seedTitle(tx, { posterColour: "#112233" });

      const found = await titlesWantingPosterColour({ cap: 100 }, tx);
      expect(found.map(({ id }) => id)).toEqual([wanting.id]);
    }));

  it("narrows to the titles named, for the add path", () =>
    inTransaction(async (tx) => {
      const one = await seedTitle(tx);
      await seedTitle(tx);

      const found = await titlesWantingPosterColour({ titleIds: [one.id] }, tx);
      expect(found.map(({ id }) => id)).toEqual([one.id]);
      expect(await titlesWantingPosterColour({ titleIds: [] }, tx)).toEqual([]);
    }));
});

describe("fillPosterColours", () => {
  it("colours every title that has a poster and none yet", () =>
    inTransaction(async (tx) => {
      const a = await seedTitle(tx);
      const b = await seedTitle(tx);
      const posterless = await seedTitle(tx, { posterPath: null });

      const outcome = await fillPosterColours(blue, { cap: 100 }, tx);

      expect(outcome.filled.map(({ id }) => id).sort()).toEqual([a.id, b.id].sort());
      expect(outcome.failures).toEqual([]);
      expect(await colourOf(tx, a.id)).toBe("#1e3cdc");
      expect(await colourOf(tx, b.id)).toBe("#1e3cdc");
      expect(await colourOf(tx, posterless.id)).toBeNull();
    }));

  it("is safe to re-run: a second pass finds nothing to do and fetches nothing", () =>
    inTransaction(async (tx) => {
      await seedTitle(tx);
      await fillPosterColours(blue, { cap: 100 }, tx);

      const fetched: string[] = [];
      const second = await fillPosterColours(
        async (posterPath) => {
          fetched.push(posterPath);
          return "#ff0000";
        },
        { cap: 100 },
        tx,
      );

      expect(second.candidates).toBe(0);
      expect(fetched).toEqual([]);
    }));

  it("records a failed poster, leaves it uncoloured, and still colours the rest", () =>
    inTransaction(async (tx) => {
      const broken = await seedTitle(tx, { posterPath: "/broken.jpg" });
      const fine = await seedTitle(tx);

      const outcome = await fillPosterColours(
        async (posterPath) => {
          if (posterPath === "/broken.jpg") throw new Error("404");
          return "#1e3cdc";
        },
        { cap: 100 },
        tx,
      );

      expect(outcome.failures.map(({ candidate }) => candidate.id)).toEqual([broken.id]);
      expect(outcome.filled.map(({ id }) => id)).toEqual([fine.id]);
      expect(await colourOf(tx, broken.id)).toBeNull();
      // Still wanting, so the next sweep tries it again.
      expect((await titlesWantingPosterColour({ cap: 100 }, tx)).map(({ id }) => id)).toEqual([
        broken.id,
      ]);
    }));

  it("stops at the cap", () =>
    inTransaction(async (tx) => {
      await seedTitle(tx);
      await seedTitle(tx);
      await seedTitle(tx);

      const outcome = await fillPosterColours(blue, { cap: 2 }, tx);
      expect(outcome.filled).toHaveLength(2);
    }));
});

describe("a refreshed poster gets a fresh colour", () => {
  it("clears the colour when the poster changes, and keeps it when it does not", () =>
    inTransaction(async (tx) => {
      const same = await seedTitle(tx, { posterPath: "/same.jpg", posterColour: "#112233" });
      const changed = await seedTitle(tx, { posterPath: "/old.jpg", posterColour: "#112233" });

      await refreshTitleMirror(filmMirror(same.tmdbId, "/same.jpg"), tx);
      await refreshTitleMirror(filmMirror(changed.tmdbId, "/new.jpg"), tx);

      expect(await colourOf(tx, same.id)).toBe("#112233");
      expect(await colourOf(tx, changed.id)).toBeNull();

      // And the next fill takes the new poster's colour.
      const outcome = await fillPosterColours(blue, { cap: 100 }, tx);
      expect(outcome.filled.map(({ id }) => id)).toEqual([changed.id]);
      expect(await colourOf(tx, changed.id)).toBe("#1e3cdc");
    }));

  it("does not store a colour taken from a poster the title no longer has", () =>
    inTransaction(async (tx) => {
      const one = await seedTitle(tx, { posterPath: "/new.jpg" });

      expect(await writePosterColour(one.id, "/old.jpg", "#1e3cdc", tx)).toBe(false);
      expect(await colourOf(tx, one.id)).toBeNull();
    }));
});

describe("the column", () => {
  it("accepts only #rrggbb", () =>
    inTransaction(async (tx) => {
      const one = await seedTitle(tx);
      await expect(
        tx.update(title).set({ posterColour: "red" }).where(eq(title.id, one.id)),
      ).rejects.toThrow();
    }));
});
