import { describe, expect, it } from "vitest";

import {
  asUserId,
  listLibrarySection,
  listLibrarySections,
  SECTION_ROW_SIZE,
  type UserId,
} from "@/db/access";
import type { Transaction } from "@/db/client";
import type { LibrarySection } from "@/db/library-section";
import { episode, libraryEntry, title, user, watch } from "@/db/schema";
import { inTransaction, setUpTestDatabase } from "./support/database";

/**
 * Library's sections — the reads behind them (issue #541). No UI: rows go in through the
 * harness's transaction and the two reads are called directly, so what is held here is
 * membership, order, the twelve-and-a-true-count cap, and the sort override.
 */

setUpTestDatabase("mediasafe_library_sections_test");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const PAST = daysFromToday(-30);
const SOON = daysFromToday(5);
const LATER = daysFromToday(40);

let counter = 0;
const nextNumber = () => ++counter;

async function seedUser(tx: Transaction): Promise<UserId> {
  const id = `reader-${nextNumber()}`;
  await tx.insert(user).values({ id, name: id, email: `${id}@example.test` });
  return asUserId(id);
}

interface EpisodeSpec {
  airDate?: string | null;
  /** `"dated"` stamps the given instant; `"undated"` writes `watched_at = NULL`. */
  watched?: Date | "undated";
}

interface TitleSpec {
  name: string;
  kind?: "show" | "film";
  /** A film's `release_date`; `undefined` is a null date. */
  releaseDate?: string;
  inProduction?: boolean;
  /** One entry per episode of season 1, in order. A film has none. */
  episodes?: EpisodeSpec[];
  /** A film's own watch. */
  filmWatched?: Date | "undated";
  abandoned?: boolean;
  addedAt?: Date;
}

interface Seeded {
  entryId: string;
}

async function seed(tx: Transaction, userId: UserId, spec: TitleSpec): Promise<Seeded> {
  const kind = spec.kind ?? "show";
  const [row] = await tx
    .insert(title)
    .values({
      kind,
      tmdbId: nextNumber(),
      name: spec.name,
      releaseYear: 2022,
      releaseDate: spec.releaseDate,
      inProduction: kind === "show" ? (spec.inProduction ?? false) : null,
    })
    .returning({ id: title.id });

  const [entry] = await tx
    .insert(libraryEntry)
    .values({
      userId,
      titleId: row.id,
      abandonedAt: spec.abandoned ? new Date() : undefined,
      addedAt: spec.addedAt,
    })
    .returning({ id: libraryEntry.id });

  const record = async (episodeId: string | null, at: Date | "undated") => {
    await tx.insert(watch).values({
      userId,
      libraryEntryId: entry.id,
      titleId: row.id,
      episodeId,
      watchedAt: at === "undated" ? null : at,
      source: "app",
      sourceKey: `test-${nextNumber()}`,
    });
  };

  for (const [index, one] of (spec.episodes ?? []).entries()) {
    const [inserted] = await tx
      .insert(episode)
      .values({
        titleId: row.id,
        tmdbEpisodeId: nextNumber(),
        seasonNo: 1,
        episodeNo: index + 1,
        name: `Episode ${index + 1}`,
        airDate: one.airDate === undefined ? PAST : one.airDate,
      })
      .returning({ id: episode.id });
    if (one.watched !== undefined) await record(inserted.id, one.watched);
  }
  if (spec.filmWatched !== undefined) await record(null, spec.filmWatched);

  return { entryId: entry.id };
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** A show in each state, by the view's own rules. */
const watching = (name: string, watched?: Date | "undated"): TitleSpec => ({
  name,
  episodes: [{ watched: watched ?? day("2026-01-01") }, {}],
});
const finished = (name: string, watched?: Date | "undated"): TitleSpec => ({
  name,
  inProduction: false,
  episodes: [{ watched: watched ?? day("2026-01-01") }, { watched: watched ?? day("2026-01-01") }],
});

async function namesIn(
  tx: Transaction,
  userId: UserId,
  section: LibrarySection,
  sort: Parameters<typeof listLibrarySection>[2] = null,
): Promise<string[]> {
  return (await listLibrarySection(userId, section, sort, tx)).map((entry) => entry.name);
}

const SHOW = (slug: Extract<LibrarySection, { kind: "show" }>["slug"]): LibrarySection => ({
  kind: "show",
  slug,
});
const FILM = (slug: Extract<LibrarySection, { kind: "film" }>["slug"]): LibrarySection => ({
  kind: "film",
  slug,
});

describe("library sections — membership", () => {
  it("puts each show in the section for its state", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, watching("Under way"));
      await seed(tx, reader, { name: "Untouched", episodes: [{}, {}] });
      // Every released episode watched, one more announced: caught up, not finished.
      await seed(tx, reader, {
        name: "Between seasons",
        episodes: [{ watched: day("2026-01-01") }, { airDate: LATER }],
      });
      await seed(tx, reader, finished("Done"));
      await seed(tx, reader, {
        name: "Given up",
        abandoned: true,
        episodes: [{ watched: day("2026-01-01") }, {}],
      });

      expect(await namesIn(tx, reader, SHOW("watching"))).toEqual(["Under way"]);
      expect(await namesIn(tx, reader, SHOW("not-started"))).toEqual(["Untouched"]);
      expect(await namesIn(tx, reader, SHOW("waiting"))).toEqual(["Between seasons"]);
      expect(await namesIn(tx, reader, SHOW("finished"))).toEqual(["Done"]);
      expect(await namesIn(tx, reader, SHOW("dropped"))).toEqual(["Given up"]);
    });
  });

  it("splits unwatched films into To watch and Coming soon, a null release date being unreleased", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "Out now", kind: "film", releaseDate: PAST });
      await seed(tx, reader, { name: "Out today", kind: "film", releaseDate: daysFromToday(0) });
      await seed(tx, reader, { name: "Next week", kind: "film", releaseDate: SOON });
      await seed(tx, reader, { name: "Undated", kind: "film" });

      expect(await namesIn(tx, reader, FILM("to-watch"))).toEqual(["Out now", "Out today"]);
      expect(await namesIn(tx, reader, FILM("coming-soon"))).toEqual(["Next week", "Undated"]);
      expect(await namesIn(tx, reader, FILM("watched"))).toEqual([]);
    });
  });

  it("puts a watched film under Watched, and an abandoned film with a watch under Dropped only", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Seen",
        kind: "film",
        releaseDate: PAST,
        filmWatched: day("2026-02-01"),
      });
      await seed(tx, reader, {
        name: "Seen then dropped",
        kind: "film",
        releaseDate: PAST,
        filmWatched: day("2026-02-01"),
        abandoned: true,
      });
      await seed(tx, reader, { name: "Never seen, dropped", kind: "film", abandoned: true });

      expect(await namesIn(tx, reader, FILM("watched"))).toEqual(["Seen"]);
      expect(await namesIn(tx, reader, FILM("dropped"))).toEqual([
        "Seen then dropped",
        "Never seen, dropped",
      ]);
    });
  });

  it("keeps shows and films apart under the shared Dropped slug", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "A show", abandoned: true, episodes: [{}] });
      await seed(tx, reader, { name: "A film", kind: "film", abandoned: true });

      expect(await namesIn(tx, reader, SHOW("dropped"))).toEqual(["A show"]);
      expect(await namesIn(tx, reader, FILM("dropped"))).toEqual(["A film"]);
    });
  });

  it("puts every entry in exactly one section, and never shows another reader's", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const other = await seedUser(tx);
      await seed(tx, reader, watching("One"));
      await seed(tx, reader, { name: "Two", episodes: [{}] });
      await seed(tx, reader, { name: "Three", kind: "film" });
      await seed(tx, reader, { name: "Four", kind: "film", releaseDate: PAST });
      await seed(tx, other, watching("Theirs"));

      const sections = await listLibrarySections(reader, tx);

      expect(sections.reduce((sum, one) => sum + one.count, 0)).toBe(4);
      expect(sections.flatMap((one) => one.entries.map((entry) => entry.name)).sort()).toEqual([
        "Four",
        "One",
        "Three",
        "Two",
      ]);
    });
  });
});

describe("library sections — the orders", () => {
  it("orders Watching by last dated watch, undated after dated by name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, watching("older", day("2026-01-01")));
      await seed(tx, reader, watching("Newer", day("2026-03-01")));
      await seed(tx, reader, watching("zed undated", "undated"));
      await seed(tx, reader, watching("Alpha undated", "undated"));

      expect(await namesIn(tx, reader, SHOW("watching"))).toEqual([
        "Newer",
        "older",
        "Alpha undated",
        "zed undated",
      ]);
    });
  });

  it("counts a show's latest dated watch, not its first, and ignores an undated one beside it", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Mixed",
        episodes: [
          { watched: day("2026-01-01") },
          { watched: day("2026-04-01") },
          { watched: "undated" },
          {},
        ],
      });
      await seed(tx, reader, watching("Between", day("2026-02-01")));

      const rows = await listLibrarySection(reader, SHOW("watching"), null, tx);

      expect(rows.map((entry) => entry.name)).toEqual(["Mixed", "Between"]);
      expect(rows[0].lastWatchedAt).toBe(day("2026-04-01").toISOString());
    });
  });

  it("orders Finished and Watched by last dated watch, undated last by name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, finished("Old", day("2025-06-01")));
      await seed(tx, reader, finished("Recent", day("2026-06-01")));
      await seed(tx, reader, finished("Undated b", "undated"));
      await seed(tx, reader, finished("Undated a", "undated"));

      await seed(tx, reader, { name: "Film old", kind: "film", filmWatched: day("2025-01-01") });
      await seed(tx, reader, { name: "Film undated", kind: "film", filmWatched: "undated" });
      await seed(tx, reader, { name: "Film recent", kind: "film", filmWatched: day("2026-01-01") });

      expect(await namesIn(tx, reader, SHOW("finished"))).toEqual([
        "Recent",
        "Old",
        "Undated a",
        "Undated b",
      ]);
      expect(await namesIn(tx, reader, FILM("watched"))).toEqual([
        "Film recent",
        "Film old",
        "Film undated",
      ]);
    });
  });

  it("orders Not started and To watch newest added first, then name, then entry id", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const older = new Date("2026-01-01T00:00:00Z");
      const newer = new Date("2026-02-01T00:00:00Z");
      const tied = new Date("2026-03-01T00:00:00Z");

      await seed(tx, reader, { name: "Oldest", addedAt: older, episodes: [{}] });
      await seed(tx, reader, { name: "zulu", addedAt: newer, episodes: [{}] });
      await seed(tx, reader, { name: "Alpha", addedAt: newer, episodes: [{}] });
      const first = await seed(tx, reader, { name: "Twin", addedAt: tied, episodes: [{}] });
      const second = await seed(tx, reader, { name: "Twin", addedAt: tied, episodes: [{}] });

      await seed(tx, reader, { name: "Film old", kind: "film", releaseDate: PAST, addedAt: older });
      await seed(tx, reader, { name: "Film b", kind: "film", releaseDate: PAST, addedAt: newer });
      await seed(tx, reader, { name: "film a", kind: "film", releaseDate: PAST, addedAt: newer });

      const ids = (await listLibrarySection(reader, SHOW("not-started"), null, tx)).map(
        (entry) => entry.libraryEntryId,
      );
      expect(ids.slice(0, 2)).toEqual([first.entryId, second.entryId].sort());
      expect(await namesIn(tx, reader, SHOW("not-started"))).toEqual([
        "Twin",
        "Twin",
        "Alpha",
        "zulu",
        "Oldest",
      ]);
      expect(await namesIn(tx, reader, FILM("to-watch"))).toEqual(["film a", "Film b", "Film old"]);
    });
  });

  it("orders Waiting by the next episode's air date, then undated, then no next episode, by name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const seen = { watched: day("2026-01-01") };
      await seed(tx, reader, { name: "Later", episodes: [seen, { airDate: LATER }] });
      await seed(tx, reader, { name: "Soon", episodes: [seen, { airDate: SOON }] });
      // A next episode TMDB has listed with no date.
      await seed(tx, reader, { name: "b undated next", episodes: [seen, { airDate: null }] });
      // Nothing next at all: every episode watched, and the show is still in production.
      await seed(tx, reader, { name: "a no next", inProduction: true, episodes: [seen, seen] });

      const rows = await listLibrarySection(reader, SHOW("waiting"), null, tx);

      expect(rows.map((entry) => entry.name)).toEqual([
        "Soon",
        "Later",
        "a no next",
        "b undated next",
      ]);
      expect(rows.map((entry) => entry.nextAirDate)).toEqual([SOON, LATER, null, null]);
    });
  });

  it("orders Coming soon by release date, a null date last, then name", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "Far", kind: "film", releaseDate: LATER });
      await seed(tx, reader, { name: "undated b", kind: "film" });
      await seed(tx, reader, { name: "Near", kind: "film", releaseDate: SOON });
      await seed(tx, reader, { name: "Undated a", kind: "film" });
      await seed(tx, reader, { name: "Also near", kind: "film", releaseDate: SOON });

      const rows = await listLibrarySection(reader, FILM("coming-soon"), null, tx);

      expect(rows.map((entry) => entry.name)).toEqual([
        "Also near",
        "Near",
        "Far",
        "Undated a",
        "undated b",
      ]);
      expect(rows.map((entry) => entry.releaseDate)).toEqual([SOON, SOON, LATER, null, null]);
    });
  });
});

describe("library sections — the row and the full grid", () => {
  it("returns at most SECTION_ROW_SIZE per section, with the section's true count", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const total = SECTION_ROW_SIZE + 3;
      for (let index = 0; index < total; index += 1) {
        await seed(tx, reader, {
          name: `Show ${String(index).padStart(2, "0")}`,
          addedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          episodes: [{}],
        });
      }
      await seed(tx, reader, { name: "A film", kind: "film", releaseDate: PAST });

      const sections = await listLibrarySections(reader, tx);
      const notStarted = sections.find(
        (one) => one.section.kind === "show" && one.section.slug === "not-started",
      );

      expect(SECTION_ROW_SIZE).toBe(12);
      expect(notStarted?.count).toBe(total);
      expect(notStarted?.entries).toHaveLength(SECTION_ROW_SIZE);
      // The row is the *first* twelve of the section's order — the newest added.
      expect(notStarted?.entries[0].name).toBe(`Show ${total - 1}`);
      expect(await listLibrarySection(reader, SHOW("not-started"), null, tx)).toHaveLength(total);
    });
  });

  it("returns every section, an empty one with a count of zero and no entries", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, { name: "Only one", episodes: [{}] });

      const sections = await listLibrarySections(reader, tx);

      expect(sections.map((one) => `${one.section.kind}/${one.section.slug}`)).toEqual([
        "show/watching",
        "show/not-started",
        "show/waiting",
        "show/finished",
        "show/dropped",
        "film/to-watch",
        "film/coming-soon",
        "film/watched",
        "film/dropped",
      ]);
      expect(sections.filter((one) => one.count === 0)).toHaveLength(8);
      expect(await namesIn(tx, reader, FILM("watched"))).toEqual([]);
    });
  });

  it("honours a LibrarySort over the section's own order, and null as the section's own order", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      await seed(tx, reader, {
        name: "Charlie",
        addedAt: new Date("2026-01-01T00:00:00Z"),
        episodes: [{}],
      });
      await seed(tx, reader, {
        name: "Alpha",
        addedAt: new Date("2026-02-01T00:00:00Z"),
        episodes: [{}],
      });
      await seed(tx, reader, {
        name: "Bravo",
        addedAt: new Date("2026-03-01T00:00:00Z"),
        episodes: [{}],
      });
      const section = SHOW("not-started");

      // The section's own order is newest added first; Title A–Z is a different order.
      expect(await namesIn(tx, reader, section, null)).toEqual(["Bravo", "Alpha", "Charlie"]);
      expect(await namesIn(tx, reader, section, "title")).toEqual(["Alpha", "Bravo", "Charlie"]);
      expect(await namesIn(tx, reader, section, "recently-added")).toEqual([
        "Bravo",
        "Alpha",
        "Charlie",
      ]);
    });
  });

  it("sorts a section by closest to finishing, which needs a join the section's own order does not", async () => {
    await inTransaction(async (tx) => {
      const reader = await seedUser(tx);
      const seen = { watched: day("2026-01-01") };
      await seed(tx, reader, { name: "Far", episodes: [seen, {}, {}, {}] });
      await seed(tx, reader, { name: "Close", episodes: [seen, seen, seen, {}] });

      expect(await namesIn(tx, reader, SHOW("watching"), "closest-to-finishing")).toEqual([
        "Close",
        "Far",
      ]);
    });
  });
});
