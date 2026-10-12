import type { AccountFigures, LibraryStateGroupEntry } from "@/db/access";
import { CountedFigure, FadedFigure } from "./figure-arrival";
import { qualification, watchTimeInWords } from "./figures";
import { YouTitleRail } from "./you-title-rail";

/**
 * The six figures that describe a watching life — issue #247.
 *
 * ── Six, and the shape of them ───────────────────────────────────────────────────────
 *
 * Two of watch time, and four counts. The pairing is the substance rather than the
 * layout: **television and film watch time are reported separately and are never summed**
 * (Watch time), and the four counts below them are two of *starting* beside
 * two of what starting led to — films watched, shows watched, episodes watched, and shows
 * completed.
 *
 * *Shows completed* is the new figure, and it sits beside *shows watched* rather than
 * replacing it deliberately: #245's user story asks for finishing to be *recorded as an
 * achievement distinct from starting it*, and a distinction needs both halves on the page
 * to be visible at all. **The two mean different things and their labels say which** —
 * `Shows watched` is *watched anything of*, `Shows completed` is the derived `finished`
 * state, and a reader seeing 12 and 5 is seeing two true sentences rather than one number
 * contradicting another.
 *
 * ── Charcoal: a card and a row of numerals — issue #405 ──────────────────────────────
 *
 * Handoff §8.8. Each section is a serif Heading. *Watch time* is one raised card (with
 * `plate-line`, like every raised container) holding Television and Film as two rows
 * divided by a hairline, the values in serif at Numeral size. *What you have watched* is
 * four counts at Figure size on the page itself — no card each — with their two-line
 * labels under them. No accent anywhere: nothing here is live and nothing is the screen's
 * one action, so `text` carries the numbers.
 *
 * ── Four across, from the narrowest phone ────────────────────────────────────────────
 *
 * The board puts the four counts in one row at `390px`, and they stay one row at `360px`:
 * a five-digit count at Figure size (`18,715`) is narrower than a quarter of the column
 * there, which was measured rather than assumed. The grid widens to the desktop's width
 * rather than centring in it, as it always did.
 */

/** A section: its Heading, and what sits under it. */
function Section({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="px-gutter pt-4 pb-2 lg:px-10">
      <h2 className="bill-title pb-2 text-bill-lg text-text">{label}</h2>
      {children}
    </section>
  );
}

/**
 * One watch time: its name on the left, the value in serif at Numeral size on the right.
 *
 * `data-numeric` is `globals.css`'s hook for tabular figures. The value arrives through
 * `figure-arrival.tsx` (issue #368) — faded in, and the server's markup is the final value.
 */
function WatchTime({ label, minutes }: { readonly label: string; readonly minutes: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="text-note text-dim">{label}</dt>
      <dd data-numeric className="bill-title text-right text-bill-md text-text">
        <FadedFigure value={watchTimeInWords(minutes)} />
      </dd>
    </div>
  );
}

/** One count: the number at Figure size, its label under it in Meta — `flex-col-reverse`
 *  so `dt` still precedes `dd` in the markup. The count runs up on arrival (#368). */
function Count({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-0.5">
      <dt className="text-meta leading-tight text-dim">{label}</dt>
      <dd data-numeric className="bill-title text-figure text-text">
        <CountedFigure value={value} />
      </dd>
    </div>
  );
}

export function YouSurface({
  figures,
  shows,
  films,
  afterFigures,
}: {
  readonly figures: AccountFigures;
  /** What sits between the figures and the rails — issue #372's year of watching, which
   *  reads for itself and so arrives from `page.tsx` already rendered. */
  readonly afterFigures?: React.ReactNode;
  /** Issue #248's shows and films rails — shows Watching or Caught up, films Finished,
   *  each most recent dated watch first (`db/access.ts`'s `listYouRails`). */
  readonly shows: readonly LibraryStateGroupEntry[];
  readonly films: readonly LibraryStateGroupEntry[];
}) {
  /**
   * One line for the whole page rather than one per section — issue #247's *one quiet
   * line*. Stats repeated its note under each of four time-based sections because a reader
   * scrolling to the streak had to be told there too; You is one screen with six figures
   * on it, so a single line under them is read by everyone who reads any of them.
   *
   * `null` when there is nothing to name, and the paragraph is then absent rather than
   * empty — a disclaimer with nothing to disclaim teaches the reader to skip the line on
   * the day it means something.
   */
  const qualifies = qualification({
    watchesWithoutRuntime: figures.watchTime.watchesWithoutRuntime,
    undatedWatches: figures.undatedWatches,
  });

  return (
    <div className="w-full pb-8">
      <Section label="Watch time">
        <dl className="flex flex-col divide-y divide-hair rounded-[var(--radius-5)] bg-raised px-4 plate-line">
          <WatchTime label="Television" minutes={figures.watchTime.televisionMinutes} />
          <WatchTime label="Film" minutes={figures.watchTime.filmMinutes} />
        </dl>
      </Section>

      <Section label="What you have watched">
        <dl className="grid grid-cols-4 gap-3">
          <Count label="Episodes watched" value={figures.episodesWatched} />
          <Count label="Films watched" value={figures.filmsWatched} />
          <Count label="Shows watched" value={figures.showsWatched} />
          <Count label="Shows completed" value={figures.showsCompleted} />
        </dl>
      </Section>

      {/*
        Nothing else joins the *figures* — `figures.titles` is read by this page and
        deliberately not printed by it: it decides the empty branch in `page.tsx` and is
        not a seventh figure. #245 is explicit that the figures the reader asked for are
        the whole of what You reports numerically, and a page that reports six things plus
        one more is a page that has started drifting back towards the nine it replaced.
      */}
      {qualifies === null ? null : (
        <p className="px-gutter pt-2 pb-2 text-meta leading-snug text-dim lg:px-10">
          {qualifies}
        </p>
      )}

      {afterFigures}

      {/*
        Then the three rails — issue #248, and not a figure among them: a list, a show and
        a film are things You leads to, not counts of them. Each is `YouRail`'s own
        absence when it has nothing (no heading, no reserved space), so there is no branch
        here beyond simply rendering all three.
      */}
      <YouTitleRail label="Shows" kind="show" entries={shows} />
      <YouTitleRail label="Films" kind="film" entries={films} />
    </div>
  );
}
