import { episodeCode } from "@/app/(signed-in)/up-next/episode-card-line";
import type { CalendarFeed } from "@/db/access";

/**
 * The calendar feed's pure half — issue #366. What the route reads is in `db/access.ts`
 * (`listCalendarFeed`); everything between those rows and the bytes a calendar app parses is
 * here, with no clock and no request, so `tests/calendar-feed.test.ts` drives all of it.
 *
 * ── Why every event is all-day ────────────────────────────────────────────────────────
 *
 * TMDB publishes an air date and no time (`UpcomingEpisode` records why there is no field for
 * one), so a timed event would be a time invented here. `VALUE=DATE` events are floating: an
 * episode dated the 12th sits on the 12th in every zone, which is what the reader expects.
 *
 * ── Why the UIDs are what they are ────────────────────────────────────────────────────
 *
 * A calendar app matches events across fetches by `UID`. Anything that changes between
 * fetches — a position in the list, the date — would make it delete and re-add the event, or
 * keep both. So an episode's UID is its row id and a film's is its catalogue title's id:
 * the air date moving updates the event instead of duplicating it.
 */

/** The path segment the route is mounted under; the token follows it. */
export const CALENDAR_FEED_PATH = "/api/calendar";

/** `crypto.randomBytes(32)` as base64url is always exactly this: 43 URL-safe characters. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The origin the feed URL and its event links are written against. `BETTER_AUTH_URL` first:
 * it is the deployment's configured public origin (the Helm chart sets it per environment),
 * and Google sign-in already depends on it being right. The request's forwarded headers are
 * the fallback for a local run without it — Traefik passes `Host` and sets
 * `X-Forwarded-Proto`, so they agree with it where both exist.
 */
export function publicOrigin(configured: string | undefined, headers: Headers): string {
  if (configured) return configured.replace(/\/+$/, "");

  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}

/** The URL a calendar app subscribes to. The `.ics` suffix is for the apps (and people)
 *  that decide what a link is by how it ends; the route accepts it with or without. */
export function calendarFeedUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${CALENDAR_FEED_PATH}/${token}.ics`;
}

/**
 * The token in the route's last segment, or `null` when the segment cannot be one. Checked
 * before the database is asked, so a malformed URL costs no query and answers the same 404
 * a replaced token does.
 */
export function calendarFeedTokenFrom(segment: string): string | null {
  const token = segment.endsWith(".ics") ? segment.slice(0, -".ics".length) : segment;
  return TOKEN_SHAPE.test(token) ? token : null;
}

/** One all-day event, already in the words the calendar will show. */
export interface CalendarEvent {
  readonly uid: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly summary: string;
  readonly description: string | null;
  readonly url: string;
}

/**
 * The reader's feed as events, in the read's order. The UID domain is a fixed name rather
 * than the request's host, so staging, production and localhost agree on what an event is
 * called (RFC 5545 asks only that the UID be globally unique, which the row id already is).
 */
export function calendarEvents(feed: CalendarFeed, origin: string): CalendarEvent[] {
  const base = origin.replace(/\/+$/, "");

  return [
    ...feed.episodes.map((row) => ({
      uid: `episode-${row.episodeId}@mediasafe`,
      date: row.airDate,
      summary: `${row.titleName} — ${episodeCode(row.seasonNo, row.episodeNo)}`,
      description: row.episodeName,
      url: `${base}/titles/${row.libraryEntryId}`,
    })),
    ...feed.films.map((row) => ({
      uid: `film-${row.titleId}@mediasafe`,
      date: row.releaseDate,
      summary: `${row.titleName} — release day`,
      description: null,
      url: `${base}/titles/${row.libraryEntryId}`,
    })),
  ];
}

/**
 * RFC 5545 text: one `VCALENDAR` holding one `VEVENT` per event, CRLF line endings, long
 * lines folded.
 *
 * `now` is `DTSTAMP`, which the RFC requires on every event and defines as when this copy of
 * the calendar was written — a parameter rather than `new Date()` so the output is a pure
 * function of its input.
 *
 * `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` (the standard and Apple/Outlook spellings) ask
 * for a refetch every six hours. Google Calendar ignores both and polls on its own schedule.
 */
export function serializeCalendar(events: readonly CalendarEvent[], now: Date): string {
  const stamp = utcStamp(now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MediaSafe//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MediaSafe",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(dayAfter(event.date))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
      `URL:${event.url}`,
      // An air date is not a meeting: it must not mark the reader busy all day.
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];

  return lines.map(fold).join("\r\n") + "\r\n";
}

/** RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; a newline becomes `\n`. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: no line longer than 75 octets, continued on the next line after one space.
 * Octets, not characters — a title in Japanese is three bytes a character — and never
 * between the bytes of one character, which would hand the parser invalid UTF-8.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // The first line has 75 octets; every continuation spends one of them on its space.
  let limit = 75;

  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

/** All-day `DTEND` is exclusive, so a one-day event ends on the next day. */
function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
