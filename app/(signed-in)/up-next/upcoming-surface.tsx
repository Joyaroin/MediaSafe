import type { UpcomingEpisode } from "@/db/access";
import { groupUpcoming } from "./upcoming-grouping";
import { UpcomingNothing } from "./upcoming-nothing";
import { UpcomingRow } from "./upcoming-row";

/**
 * Page two of the landing pager — issue #251.
 *
 * The future-dated episodes of the shows standing at **Watching or Caught up**, grouped by
 * Today, Tomorrow, a named weekday and Later, in the reader's own timezone.
 *
 * ── A server component, and the grouping happens here rather than in the read ────────
 *
 * `listUpcomingEpisodes` returns dated rows over a window a day wider than the server's own
 * day; `groupUpcoming` narrows that to the reader's actual today and writes the headings.
 * The split is #245's instruction — *grouping is a pure module beside the read, taking the
 * zone and the current day as arguments rather than reading a clock* — and it is what makes
 * the one failure this ticket is about assertable: a grouping wrong by one timezone is
 * wrong forever and looks entirely correct.
 *
 * `today` is a prop rather than a `new Date()` here, for the same reason one level further
 * out. `page.tsx` is the one place on this route that reads a clock, and it reads it once,
 * against `requireTimezone()`.
 *
 * ── Films are #252's and their absence here is deliberate ───────────────────────────
 *
 * The handoff draws *Upcoming movies* under these rows — the watchlist films whose release
 * date is still ahead, with a countdown. That is a separate ticket over a separate read,
 * and it lands as a second section beside this one. Nothing here reserves space for it: an
 * empty section is exactly what `SPEC.md` §8 forbids, and #245's *nothing upcoming gets the
 * handoff's sentence* is answered by this page having no rows rather than by it having no
 * films.
 *
 * ── Empty and failed, kept apart ────────────────────────────────────────────────────
 *
 * No groups is the handoff's sentence (`UpcomingNothing`), and it is reachable only from a
 * read that succeeded. A failure throws past this into the route's `error.tsx`, which draws
 * the inline read-failure treatment with a reference id. This is the screen `AGENTS.md`'s
 * rule was written about, one page along from where it was written.
 */
export function UpcomingSurface({
  episodes,
  today,
}: {
  episodes: readonly UpcomingEpisode[];
  /** The reader's own day, `YYYY-MM-DD`, from `page.tsx`. */
  today: string;
}) {
  const groups = groupUpcoming(episodes, today);

  if (groups.length === 0) return <UpcomingNothing />;

  return (
    <section className="pt-[26px] pb-2">
      {/* The rail heads' register on page one, held here so the two pages read as one
          screen: the label line in the accent, which `DESIGN.md` §3 allows as *the way
          through this screen*. A heading and never a count — `SPEC.md` §7's *no counts,
          anywhere* is narrowed by #245 to rail heads only, and this is one. */}
      <div className="px-[22px] pb-1">
        <h2 className="label-line text-accent">Upcoming episodes</h2>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="px-[22px] pt-4">
          {/* The day's own heading, in the body register rather than the label one, because
              it is the thing a reader scans for. `Today` and `Tomorrow` are words and a
              weekday is a name; none of the four is a date, which is what each row carries
              for itself. */}
          <h3 id={`upcoming-${group.key}`} className="text-item font-semibold text-text">
            {group.label}
          </h3>

          <ul
            aria-labelledby={`upcoming-${group.key}`}
            className="stagger-rise mt-2.5 flex flex-col gap-2"
          >
            {group.episodes.map((episode) => (
              <UpcomingRow key={episode.episodeId} episode={episode} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
