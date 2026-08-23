import type { AccountStats } from "@/db/access";
import {
  activityChartData,
  averageInWords,
  dayInWords,
  decadeChartData,
  decadeInWords,
  minutesInWords,
  monthInWords,
  plural,
  STATE_LABELS,
  undatedNote,
} from "./stats-figures";
import { StatsBarChart } from "./stats-bar-chart";

/**
 * The Stats page, as type — issue #227, with its charts from #229.
 *
 * **The charts arrived beside these sections, not into a hole left for them.** #227 built
 * this page with no chart and no space held for one — a page laid out around a gap reads as
 * broken until the gap fills — so #229's four charts (`stats-bar-chart.tsx`) sit inside the
 * `Activity` and `Top decades` sections that already existed rather than reshaping the page
 * around them. Removing them leaves #227's page exactly as it shipped.
 *
 * **No genre statistic, and no space held for one either.** There is no genre column, no
 * genre in the mirror, and nothing that has ever read one, so there is nothing to report and
 * no honest way to reserve a section for it.
 *
 * ── What the page is made of ─────────────────────────────────────────────────────────
 *
 * Eight sections, each a `label-line` head over a list of figures. `Figure` and `Section`
 * below are the two shapes every one of them is built from, which is what keeps a page of a
 * dozen unrelated numbers reading as one page rather than as a dozen cards.
 *
 * **No accent anywhere, charts included.** `globals.css` rations vermilion to recording a
 * watch, and a page whose whole content is quantities is the easiest place in the
 * application to spend it by accident — one highlighted figure and the reservation is gone.
 * `--ink` carries emphasis here, exactly as the active tab does. `DESIGN.md` §3 pre-commits
 * the charts to the same rule by name — *no decorative colour on a chart* — and its own
 * precedent for "the current one" agrees: the current sidebar destination is drawn in
 * `text`, not the accent, because *accent means live action* and marking a fact the reader
 * can already see is not one.
 *
 * ── The honesty rules, and where each one shows ──────────────────────────────────────
 *
 * Four sections are about *when* something happened, and every one of them carries the same
 * sentence naming how many watches have no date and are not counted in it. It is repeated
 * rather than stated once at the top on purpose: a reader who scrolls to the streak and
 * reads it in isolation has to be told there too, and a single note at the top of a long
 * page is a note that applies to whatever the reader remembers of it.
 *
 * Watch time carries its own version of the same rule — how many watches carried no runtime
 * — and the decades section says how many titles have no release year to place. In all three
 * cases the number is only printed when it is not zero: a disclaimer with nothing to
 * disclaim teaches the reader to skip the line on the day it means something.
 */

/** One figure: a quiet label, and the thing it is. `data-numeric` is `globals.css`'s hook
 *  for tabular figures, so a column of numbers lines up on its digits. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-item text-dim">{label}</dt>
      <dd data-numeric className="text-item font-medium text-text">
        {value}
      </dd>
    </div>
  );
}

/** A section: its label, its figures, its charts, and — where there is one — the sentence
 *  saying what the figures do not cover.
 *
 *  `charts` is a sibling of `dl`, never inside it: `StatsBarChart`'s markup is a `div`, and
 *  a `dl`'s content model is `dt`/`dd` groups and nothing else (issue #229). It sits after
 *  the figures and before the note, so a section reads *numbers, then their shape, then
 *  what neither counts* — and the note, when there is one, still reads as covering both. */
function Section({
  label,
  note,
  charts,
  children,
}: {
  label: string;
  note?: string | null;
  charts?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-[22px] py-5">
      <h2 className="label-line text-dim">{label}</h2>

      <dl className="mt-3">{children}</dl>

      {charts}

      {note ? <p className="mt-3 text-item leading-relaxed text-dim">{note}</p> : null}
    </section>
  );
}

/**
 * A section with nothing in it yet — *no title has finished*, *no release year on file*.
 *
 * A sentence rather than an omitted section, and rather than a zero. An omitted section
 * would make the page's shape depend on the account and leave a reader wondering whether
 * they had missed something; a zero would be a measurement of something that was never
 * measured. This is `DESIGN.md`'s empty treatment at the size of one section.
 */
function NothingYet({ children }: { children: React.ReactNode }) {
  return <p className="text-item leading-relaxed text-dim">{children}</p>;
}

export function StatsSurface({ stats }: { stats: AccountStats }) {
  /** One sentence, four sections. Computed once so the four cannot drift into four
   *  wordings of the same fact. */
  const undated = undatedNote(stats.undatedWatches);

  /*
    `divide-y`, not a `border-t` on each section. The rule belongs *between* sections and
    nowhere else: a top border on the first one would put a hairline directly under the
    screen title, which is exactly what turn 9 took away from all four phone screens
    (`stats-heading.tsx`, and `library-heading.tsx` for the argument). `divide-y` draws a
    rule on every child but the first, so the last section has no trailing rule either —
    a page ending in a hairline over empty space is the same mistake at the other end.
  */
  return (
    <div className="w-full divide-y divide-hair pb-8">
      <Section label="What you have watched">
        <Figure label="Films" value={stats.filmsWatched.toLocaleString("en-GB")} />
        <Figure label="Shows" value={stats.showsWatched.toLocaleString("en-GB")} />
        <Figure label="Episodes" value={stats.episodesWatched.toLocaleString("en-GB")} />
        <Figure
          label="Episodes remaining"
          value={stats.episodesRemaining.toLocaleString("en-GB")}
        />
      </Section>

      <Section label="Where things stand">
        {stats.states.map(({ state, titles }) => (
          <Figure
            key={state}
            label={STATE_LABELS[state]}
            value={titles.toLocaleString("en-GB")}
          />
        ))}
      </Section>

      {/* The streak is a fact about days, so it names the undated watches like the three
          sections below it. A reader on a long run deserves to know what is not in it. */}
      <Section label="Streak" note={undated}>
        <Figure
          label="Consecutive days, up to today"
          value={plural(stats.streakDays, "day")}
        />
      </Section>

      {/*
        Watch time's note is its own, not the undated one: a watch with no date still
        contributes its runtime, and a watch with no runtime still counts as a watch. The
        two incompletenesses are independent and saying so is the point of the section.
      */}
      <Section
        label="Watch time"
        note={
          stats.watchTime.watchesWithoutRuntime > 0
            ? `${plural(stats.watchTime.watchesWithoutRuntime, "watch", "watches")} carried no runtime, so these totals are a floor rather than an exact figure.`
            : null
        }
      >
        <Figure label="Film" value={minutesInWords(stats.watchTime.filmMinutes)} />
        <Figure
          label="Television"
          value={minutesInWords(stats.watchTime.televisionMinutes)}
        />
      </Section>

      <Section label="How often" note={undated}>
        <Figure label="Episodes a week" value={averageInWords(stats.episodesPerWeek, "week")} />
        <Figure
          label="Episodes a month"
          value={averageInWords(stats.episodesPerMonth, "month")}
        />
      </Section>

      <Section
        label="Activity"
        note={undated}
        charts={
          <>
            <StatsBarChart
              caption="Episodes watched, by month"
              data={activityChartData(stats.activity, "episodeWatches")}
            />
            <StatsBarChart
              caption="Films watched, by month"
              data={activityChartData(stats.activity, "filmWatches")}
            />
            <StatsBarChart
              caption="All watches, by month"
              data={activityChartData(stats.activity, "watches")}
            />
          </>
        }
      >
        {stats.activity.map(({ month, watches }) => (
          <Figure
            key={month}
            label={monthInWords(month)}
            value={watches.toLocaleString("en-GB")}
          />
        ))}
      </Section>

      <Section label="Recently finished" note={undated}>
        {stats.recentlyFinished.length === 0 ? (
          <NothingYet>
            No title has finished on a dated watch yet. A film you mark, or a show you reach
            the end of, appears here.
          </NothingYet>
        ) : (
          stats.recentlyFinished.map((one) => (
            <Figure
              key={one.libraryEntryId}
              label={one.releaseYear === null ? one.name : `${one.name} (${one.releaseYear})`}
              value={dayInWords(one.finishedOn)}
            />
          ))
        )}
      </Section>

      <Section
        label="Top decades"
        note={
          stats.titlesWithoutReleaseYear > 0
            ? `${plural(stats.titlesWithoutReleaseYear, "title")} in your library ${stats.titlesWithoutReleaseYear === 1 ? "has" : "have"} no release year on file, and ${stats.titlesWithoutReleaseYear === 1 ? "belongs" : "belong"} to no decade here.`
            : null
        }
        charts={
          stats.topDecades.length > 0 ? (
            <StatsBarChart
              caption="Titles in your library, by decade"
              data={decadeChartData(stats.topDecades)}
            />
          ) : null
        }
      >
        {stats.topDecades.length === 0 ? (
          <NothingYet>
            Nothing in your library has a release year on file yet, so there is no decade to
            place it in.
          </NothingYet>
        ) : (
          stats.topDecades.map(({ decade, titles }) => (
            <Figure
              key={decade}
              label={decadeInWords(decade)}
              value={plural(titles, "title")}
            />
          ))
        )}
      </Section>
    </div>
  );
}
