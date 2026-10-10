import { describe, expect, it } from "vitest";

import type { CalendarFeed } from "@/db/access";
import {
  calendarEvents,
  calendarFeedTokenFrom,
  calendarFeedUrl,
  publicOrigin,
  serializeCalendar,
  type CalendarEvent,
} from "@/lib/calendar-feed";

/**
 * The calendar feed's pure half — issue #366: rows in, RFC 5545 text out. What the database
 * returns is `tests/calendar-feed-access.test.ts`'s; this asks only what a calendar app will
 * parse.
 */

const NOW = new Date("2026-10-10T08:30:15.123Z");
const TOKEN = "a".repeat(43);

const FEED: CalendarFeed = {
  episodes: [
    {
      episodeId: "11111111-1111-4111-8111-111111111111",
      libraryEntryId: "entry-show",
      titleName: "Severance",
      seasonNo: 2,
      episodeNo: 5,
      episodeName: "Trojan's Horse",
      airDate: "2026-10-12",
    },
  ],
  films: [
    {
      titleId: "22222222-2222-4222-8222-222222222222",
      libraryEntryId: "entry-film",
      titleName: "Hamnet",
      releaseDate: "2026-12-31",
    },
  ],
};

/** Unfolds continuation lines (RFC 5545 §3.1) and splits into logical lines. */
function logicalLines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: "episode-x@mediasafe",
    date: "2026-10-12",
    summary: "Show — S01 · E01",
    description: null,
    url: "https://example.test/titles/entry",
    ...overrides,
  };
}

describe("calendarEvents", () => {
  it("makes one all-day event per episode and per film, with the title page as the link", () => {
    const events = calendarEvents(FEED, "https://staging.mediasafe.space/");

    expect(events).toEqual([
      {
        uid: "episode-11111111-1111-4111-8111-111111111111@mediasafe",
        date: "2026-10-12",
        summary: "Severance — S02 · E05",
        description: "Trojan's Horse",
        url: "https://staging.mediasafe.space/titles/entry-show",
      },
      {
        uid: "film-22222222-2222-4222-8222-222222222222@mediasafe",
        date: "2026-12-31",
        summary: "Hamnet — release day",
        description: null,
        url: "https://staging.mediasafe.space/titles/entry-film",
      },
    ]);
  });

  /**
   * The acceptance criterion: calendar apps match events by UID, so a UID that moved with
   * the date or the origin would duplicate the event instead of updating it.
   */
  it("keeps an event's UID when its date moves and when the origin differs", () => {
    const moved: CalendarFeed = {
      episodes: [{ ...FEED.episodes[0], airDate: "2026-11-02" }],
      films: [{ ...FEED.films[0], releaseDate: "2027-01-15" }],
    };

    const before = calendarEvents(FEED, "https://staging.mediasafe.space");
    const after = calendarEvents(moved, "http://localhost:3000");

    expect(after.map((e) => e.uid)).toEqual(before.map((e) => e.uid));
  });

  it("leaves the description out for an episode TMDB has not named", () => {
    const unnamed: CalendarFeed = {
      episodes: [{ ...FEED.episodes[0], episodeName: null }],
      films: [],
    };

    const ics = serializeCalendar(calendarEvents(unnamed, "https://x.test"), NOW);

    expect(ics).not.toContain("DESCRIPTION");
  });

  it("calls season zero Specials, as every other surface does", () => {
    const special: CalendarFeed = {
      episodes: [{ ...FEED.episodes[0], seasonNo: 0, episodeNo: 3 }],
      films: [],
    };

    expect(calendarEvents(special, "https://x.test")[0].summary).toBe(
      "Severance — Specials · E03",
    );
  });
});

describe("serializeCalendar", () => {
  it("writes a calendar with one VEVENT per event, every line ending in CRLF", () => {
    const ics = serializeCalendar(calendarEvents(FEED, "https://x.test"), NOW);

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const lines = logicalLines(ics);
    expect(lines.slice(0, 3)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MediaSafe//Calendar feed//EN",
    ]);
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(2);
  });

  it("writes an episode as an all-day, non-blocking event dated by its air date", () => {
    const lines = logicalLines(serializeCalendar(calendarEvents(FEED, "https://x.test"), NOW));
    const first = lines.slice(lines.indexOf("BEGIN:VEVENT"), lines.indexOf("END:VEVENT") + 1);

    expect(first).toEqual([
      "BEGIN:VEVENT",
      "UID:episode-11111111-1111-4111-8111-111111111111@mediasafe",
      "DTSTAMP:20261010T083015Z",
      "DTSTART;VALUE=DATE:20261012",
      "DTEND;VALUE=DATE:20261013",
      "SUMMARY:Severance — S02 · E05",
      "DESCRIPTION:Trojan's Horse",
      "URL:https://x.test/titles/entry-show",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ]);
  });

  it("ends an all-day event on the next day, across a year boundary", () => {
    const lines = logicalLines(serializeCalendar(calendarEvents(FEED, "https://x.test"), NOW));

    expect(lines).toContain("DTSTART;VALUE=DATE:20261231");
    expect(lines).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("writes an empty calendar, still valid, when nothing is coming", () => {
    const lines = logicalLines(serializeCalendar([], NOW));

    expect(lines).toContain("BEGIN:VCALENDAR");
    expect(lines).toContain("END:VCALENDAR");
    expect(lines).not.toContain("BEGIN:VEVENT");
  });

  it("escapes the characters RFC 5545 reserves in text", () => {
    const ics = serializeCalendar(
      [event({ summary: "Love, Death; Robots\\ Vol. 4", description: "Line one\nLine two" })],
      NOW,
    );
    const lines = logicalLines(ics);

    expect(lines).toContain("SUMMARY:Love\\, Death\\; Robots\\\\ Vol. 4");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds lines over 75 octets without splitting a character's bytes", () => {
    const longName = "進撃の巨人".repeat(12);
    const ics = serializeCalendar([event({ summary: `${longName} — S01 · E01` })], NOW);
    const encoder = new TextEncoder();

    for (const physical of ics.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
      // A split inside a multi-byte character would surface as U+FFFD on decode.
      expect(physical).not.toContain("�");
    }
    expect(logicalLines(ics)).toContain(`SUMMARY:${longName} — S01 · E01`);
  });
});

describe("the feed's URL and token", () => {
  it("builds the URL under /api/calendar with an .ics suffix", () => {
    expect(calendarFeedUrl("https://mediasafe.space/", TOKEN)).toBe(
      `https://mediasafe.space/api/calendar/${TOKEN}.ics`,
    );
  });

  it("reads the token back out of the route segment, with or without .ics", () => {
    expect(calendarFeedTokenFrom(`${TOKEN}.ics`)).toBe(TOKEN);
    expect(calendarFeedTokenFrom(TOKEN)).toBe(TOKEN);
  });

  it("refuses a segment that cannot be a token, before any query", () => {
    expect(calendarFeedTokenFrom("")).toBeNull();
    expect(calendarFeedTokenFrom("short.ics")).toBeNull();
    expect(calendarFeedTokenFrom(`${"a".repeat(42)}%.ics`)).toBeNull();
    expect(calendarFeedTokenFrom(`${TOKEN}a.ics`)).toBeNull();
  });

  it("prefers the configured origin, and falls back to the forwarded headers", () => {
    const forwarded = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "staging.mediasafe.space",
      "x-forwarded-proto": "https",
    });

    expect(publicOrigin("https://mediasafe.space/", forwarded)).toBe("https://mediasafe.space");
    expect(publicOrigin(undefined, forwarded)).toBe("https://staging.mediasafe.space");
    expect(publicOrigin(undefined, new Headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });
});
