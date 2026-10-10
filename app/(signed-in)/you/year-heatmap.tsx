"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { dayInWords, watchesInWords, type Heatmap } from "./heatmap";

/**
 * The year grid — issue #372. One cell per day, Monday-to-Sunday columns, shaded by how
 * many watches the day had; selecting a day lists them beneath.
 *
 * ── Neutral only ─────────────────────────────────────────────────────────────────────
 *
 * The shades are the linen tokens and nothing else — `raised`, `hair`, `dim` at half,
 * `dim`, `text` — never the accent (nothing here is live or the screen's one action) and
 * never a poster tint. `tests/accent-sweep.test.ts` holds the first half.
 *
 * ── One tab stop, arrows inside ──────────────────────────────────────────────────────
 *
 * 365 buttons in the tab order would make the rest of You unreachable by keyboard. So the
 * grid is one stop (a roving `tabIndex`): Up and Down move a day, Left and Right a week,
 * Home and End to either end. Focus selects, as a tap does, so the list below follows
 * the keyboard and is announced through `aria-live`.
 *
 * ── Phone width ──────────────────────────────────────────────────────────────────────
 *
 * Fifty-three weeks do not fit a phone, and the page must not scroll sideways, so the
 * grid scrolls inside its own box and opens scrolled to today.
 */

const SHADES = ["bg-raised", "bg-hair", "bg-dim/50", "bg-dim", "bg-text"] as const;

/** One column of cells and one gap, which is also the month labels' pitch. */
const CELL = "size-3.5";
const COLUMNS = "auto-cols-[0.875rem] gap-[3px]";

export function YearHeatmap({ heatmap }: { readonly heatmap: Heatmap }) {
  const { days, leading, total } = heatmap;
  const [selected, setSelected] = useState(() => lastWatchedIndex(heatmap));
  const scroller = useRef<HTMLDivElement | null>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const element = scroller.current;
    if (element !== null) element.scrollLeft = element.scrollWidth;
  }, []);

  function move(to: number) {
    const next = Math.max(0, Math.min(days.length - 1, to));
    setSelected(next);
    cells.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (event.key in step) move(selected + step[event.key]);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(days.length - 1);
    else return;
    event.preventDefault();
  }

  const chosen = days[selected];

  return (
    <section aria-labelledby="year-of-watching" className="px-gutter pt-4 pb-6 lg:px-10">
      <h2 id="year-of-watching" className="bill-title text-bill-xs text-text">
        A year of watching
      </h2>
      <p className="mt-1 text-meta text-dim" data-numeric>
        {watchesInWords(total)} in the last 12
        months
      </p>

      <div ref={scroller} className="mt-3 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div aria-hidden="true" className={`grid w-max grid-flow-col ${COLUMNS} pb-1`}>
          {monthLabels(days.map((one) => one.day), leading).map((label, column) => (
            <span key={column} className="h-3 overflow-visible text-label leading-none whitespace-nowrap text-dim">
              {label}
            </span>
          ))}
        </div>

        <div
          role="group"
          aria-label="Watches per day over the last 12 months. Arrow keys move between days."
          onKeyDown={onKeyDown}
          className={`grid w-max grid-flow-col grid-rows-7 ${COLUMNS}`}
        >
          {Array.from({ length: leading }, (_, index) => (
            <span key={`blank-${index}`} aria-hidden="true" className={CELL} />
          ))}
          {days.map((one, index) => (
            <button
              key={one.day}
              ref={(element) => {
                cells.current[index] = element;
              }}
              type="button"
              tabIndex={index === selected ? 0 : -1}
              aria-label={one.label}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              onFocus={() => setSelected(index)}
              className={`${CELL} ${SHADES[one.shade]} ${
                index === selected ? "ring-1 ring-text ring-offset-1 ring-offset-ground" : ""
              }`}
            />
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="mt-2 flex items-center gap-[3px] text-label text-dim">
        <span className="mr-1">Less</span>
        {SHADES.map((shade) => (
          <span key={shade} className={`${CELL} ${shade}`} />
        ))}
        <span className="ml-1">More</span>
      </div>

      <div aria-live="polite" className="mt-4">
        <p className="label-line text-dim">
          {chosen.count === 0
            ? `Nothing watched on ${dayInWords(chosen.day)}`
            : `${dayInWords(chosen.day)} · ${watchesInWords(chosen.count)}`}
        </p>
        {chosen.count === 0 ? null : (
          <ul className="mt-2 grid grid-cols-1 gap-1 lg:grid-cols-2">
            {chosen.watches.map((watch) => (
              <li key={watch.key} className="min-w-0">
                <Link
                  href={`/titles/${watch.libraryEntryId}`}
                  className="flex min-w-0 items-baseline gap-2 py-1 text-item"
                >
                  <span className="truncate text-text">{watch.titleName}</span>
                  <span className="shrink-0 text-meta text-dim">{watch.what}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The most recent day with a watch — what the list beneath opens on. */
function lastWatchedIndex(heatmap: Heatmap): number {
  for (let index = heatmap.days.length - 1; index >= 0; index -= 1) {
    if (heatmap.days[index].count > 0) return index;
  }
  return heatmap.days.length - 1;
}

/** A short month name over the column holding that month's 1st, nothing over the rest. */
function monthLabels(days: readonly string[], leading: number): string[] {
  const columns = Math.ceil((leading + days.length) / 7);
  const labels: string[] = Array.from({ length: columns }, () => "");
  days.forEach((day, index) => {
    if (!day.endsWith("-01")) return;
    labels[Math.floor((leading + index) / 7)] = new Date(`${day}T00:00:00Z`).toLocaleDateString(
      "en-GB",
      { month: "short", timeZone: "UTC" },
    );
  });
  return labels;
}
