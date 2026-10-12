"use client";

import { AnimatePresence } from "motion/react";
import { useState } from "react";

import type { LibraryStateGroupEntry, UpNextEntry, UpNextPendingEntry } from "@/db/access";
import { FilmRow, useFilmsStanding } from "./film-row";
import { ROW_LIST } from "./up-next-card-styles";
import { UpNextEpisodeRow, UpNextPendingRow } from "./up-next-episode-row";

/**
 * Tonight's list — *Also ready* under the featured episode, or the whole screen when there
 * is no featured episode (Charcoal, issue #400; handoff §8.1).
 *
 * The order is the phone's own concatenation, unchanged: titles still arriving first (a
 * reader who has just added a show must see it), then the remaining Continue watching
 * entries, then old friends, then films to watch. `tonight-surface.tsx` hands the episode
 * entries over already in that order and already without the featured one.
 *
 * ── The first five, then *See all N* — open question 1 ───────────────────────────────
 *
 * The handoff proposes expanding in place and asks that it stay easy to change. The rows
 * past the fifth are **hidden with CSS, never unmounted**: a row can be in the middle of a
 * hold or a write, and a list that unmounted it on collapse would drop that on the floor.
 * `nth-child` counts only the rows actually rendered, so a row marked away hands its place
 * to the next. To make *See all* a separate screen instead, replace the `button` with a
 * link and drop `expanded`.
 *
 * `N` is the rows standing right now — pending rows, episode rows still on the list, and
 * films not yet watched (`useFilmsStanding`) — so it is never a count of rows already gone.
 */
export function TonightList({
  title,
  pending,
  entries,
  films,
}: {
  /** *Also ready* under a featured episode; `null` when this list is the screen. */
  title: string | null;
  pending: readonly UpNextPendingEntry[];
  entries: readonly UpNextEntry[];
  films: readonly LibraryStateGroupEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const filmsStanding = useFilmsStanding(films);
  const count = pending.length + entries.length + filmsStanding;

  if (count === 0) return null;

  const collapsible = count > FIRST_SHOWN && !expanded;

  return (
    <section
      aria-labelledby={title === null ? undefined : "tonight-list-title"}
      aria-label={title === null ? "Ready to watch" : undefined}
      className="px-gutter pt-5 lg:px-0 xl:pt-0"
    >
      {title === null && !collapsible ? null : (
        <div className="-mr-3 flex min-h-11 items-center justify-between gap-3">
          {title === null ? (
            <span />
          ) : (
            <h2 id="tonight-list-title" className="bill-title text-bill-lg text-text">
              {title}
            </h2>
          )}
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-controls="tonight-list"
              className="flex min-h-11 items-center px-3 text-item font-medium text-text hover:text-dim"
            >
              See all {count}
            </button>
          ) : null}
        </div>
      )}

      <ul
        id="tonight-list"
        className={`${ROW_LIST} ${expanded ? "" : "[&>li:nth-child(n+6)]:hidden"}`}
      >
        {pending.map((entry, index) => (
          <UpNextPendingRow key={entry.libraryEntryId} entry={entry} aboveFold={index < FIRST_SHOWN} />
        ))}
        {/* `initial={false}`: rows on the first paint arrive with the list's own stagger,
            not a second entrance. What this is for is the leaving — a row whose last aired
            episode was just marked fades out after its hold, and `layout` closes the gap. */}
        <AnimatePresence initial={false}>
          {entries.map((entry, index) => (
            <UpNextEpisodeRow
              key={entry.libraryEntryId}
              entry={entry}
              aboveFold={pending.length + index < FIRST_SHOWN}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {films.map((film, index) => (
            <FilmRow
              key={film.libraryEntryId}
              film={film}
              aboveFold={pending.length + entries.length + index < FIRST_SHOWN}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** Handoff §8.1: the first five show; the rest are behind *See all*. */
const FIRST_SHOWN = 5;
