"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";

/**
 * The Stats page's one chart primitive — issue #229.
 *
 * **The library supplies geometry, the design system supplies appearance.** Recharts draws
 * the bars; everything a reader sees the colour of comes from a token, so light and dark
 * follow the app the same way every other surface does. What Recharts supplies by default
 * and this deliberately turns off rather than restyles: the Cartesian grid (never mounted),
 * the legend (never mounted), and the axes (never mounted — twelve month labels do not fit a
 * phone's width, and the section beside every chart already prints every one of these
 * numbers in words). What is restyled rather than turned off is the tooltip, because *there
 * are no drop shadows at all* has to stay literally true and Recharts' default tooltip
 * carries one — `TooltipCard` below is a hairline-bordered `--raised` panel with none.
 *
 * **No visible count on the chart itself.** No `<LabelList>`, no on-bar numeral — a bar
 * chart whose bars are captioned with the number they represent is chrome DESIGN.md's
 * *no counts* rule already forbids elsewhere on the app, printed here instead of skipped.
 * The number is one hover or tap away, in the tooltip, and always available without either
 * in the table below.
 *
 * **Every bar is `--text`, and none of them is the accent.** `DESIGN.md` §3 pre-commits to
 * this by name — *"No decorative colour on a chart when charts arrive (#229)"* — and §3's
 * own precedent for "the current one" is the same answer: the current sidebar destination
 * is `text` at full strength against `dim` siblings, not the accent, because *accent means
 * live action* and a fact the reader can already see (the section's own figures print the
 * current month last) is not an action. `--accent` stays reserved for recording a watch,
 * exactly as `stats-surface.tsx`'s figures already keep it.
 */

/** One bar, and the two ways its value reaches a reader: the number itself, for the
 *  tooltip and the hidden table, and `valueLabel`, the same number in words — `"3
 *  episodes"` rather than a bare `3`, since a screen reader user should not have to guess
 *  the unit a sighted reader gets for free from the section heading. */
export interface StatsBarDatum {
  readonly key: string;
  /** Kept out of the chart itself (no axis) and used only in the tooltip and the hidden
   *  table — `"August 2026"`, `"1990s"`. */
  readonly label: string;
  readonly value: number;
  readonly valueLabel: string;
}

/** `Tooltip`'s `content`, replacing Recharts' own rather than styling it: the default
 *  carries inline styles this world has no token for, and overriding each one is the same
 *  amount of work as not rendering it at all. */
function TooltipCard({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload: StatsBarDatum }[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;

  return (
    <div className="border border-hair bg-raised px-2.5 py-1.5 text-fine text-text shadow-none">
      <p className="text-dim">{datum.label}</p>
      <p data-numeric className="font-medium">
        {datum.valueLabel}
      </p>
    </div>
  );
}

/** The numbers behind the chart, for a screen reader — issue #215's user story 60: *"the
 *  numbers behind every chart, so that a picture is not the only way to read this page."*
 *  Visually hidden rather than omitted, because the chart beside it is `aria-hidden` and
 *  carries no text a screen reader could read instead. */
function HiddenDataTable({
  caption,
  data,
}: {
  caption: string;
  data: readonly StatsBarDatum[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Count</th>
        </tr>
      </thead>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.key}>
            <th scope="row">{datum.label}</th>
            <td>{datum.valueLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A row of bars, geometry only, plus the hidden table that carries what the geometry
 * cannot: the actual numbers.
 *
 * `caption` names the chart for the hidden table and nowhere else — the chart itself has
 * no visible heading of its own, because it always sits inside a `Section` that already
 * has one (`stats-surface.tsx`). Two headings over the same numbers would be the page
 * repeating itself.
 */
export function StatsBarChart({
  caption,
  data,
}: {
  caption: string;
  data: readonly StatsBarDatum[];
}) {
  return (
    <div className="mt-3">
      <div aria-hidden="true" className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data as StatsBarDatum[]} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <Tooltip content={<TooltipCard />} cursor={false} />
            <Bar
              dataKey="value"
              fill="var(--color-text)"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <HiddenDataTable caption={caption} data={data} />
    </div>
  );
}
