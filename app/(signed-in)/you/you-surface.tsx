import type { AccountFigures } from "@/db/access";
import { qualification, watchTimeInWords } from "./figures";

/**
 * The six figures that describe a watching life — issue #247.
 *
 * ── Six, and the shape of them ───────────────────────────────────────────────────────
 *
 * Two of watch time, and four counts. The pairing is the substance rather than the
 * layout: **television and film watch time are reported separately and are never summed**
 * (`CONTEXT.md`, Watch time), and the four counts below them are two of *starting* beside
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
 * ── No accent anywhere ───────────────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s amendment rations the accent to *what is live, and the one primary action
 * of a screen*. This screen has neither: nothing on it is live and there is nothing to
 * press. A page whose whole content is quantities is the easiest place in the application
 * to spend the accent by accident — one highlighted figure and the reservation is gone —
 * so `--ink` carries the emphasis, exactly as the screen title does.
 *
 * ── No shadow, and the tone step is the only lift ────────────────────────────────────
 *
 * The cards are `--raised` on `--ground`, which since turn 9 is a step *down* rather than
 * up. That inversion is why they need no border and no elevation to read as cards, and
 * `SPEC.md`'s no-shadow rule is unchanged.
 *
 * ── The desktop widens rather than centres ───────────────────────────────────────────
 *
 * No `mx-auto max-w-*` anywhere below, which is the criterion said as a class list: the
 * sections take the width `(signed-in)/layout.tsx` leaves beside the sidebar, and the two
 * grids grow their column count into it — watch time 1→2, the counts 2→4. A phone column
 * centred in a desktop shell is the port this page is not allowed to look like.
 */

/**
 * One figure: a quiet label over the thing it is.
 *
 * `data-numeric` is `globals.css`'s hook for tabular figures, so the counts line up on
 * their digits down a column. It is on the watch times too — they are mostly digits, and
 * a column whose two halves used different figures would be visibly two columns.
 */
function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-[16px] bg-raised px-4 py-4">
      <dt className="label-line text-dim">{label}</dt>
      <dd data-numeric className="mt-2 text-bill-md font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}

/** A section: its label, and the figures under it. */
function Section({
  label,
  columns,
  children,
}: {
  readonly label: string;
  /** The grid the figures sit on. Phone first, then the desktop widening. */
  readonly columns: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="px-[22px] py-4 lg:px-10">
      <h2 className="label-line text-dim">{label}</h2>
      <dl className={`mt-3 grid gap-3 ${columns}`}>{children}</dl>
    </section>
  );
}

export function YouSurface({ figures }: { readonly figures: AccountFigures }) {
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
      <Section label="Watch time" columns="sm:grid-cols-2">
        <Figure
          label="Television"
          value={watchTimeInWords(figures.watchTime.televisionMinutes)}
        />
        <Figure label="Film" value={watchTimeInWords(figures.watchTime.filmMinutes)} />
      </Section>

      <Section label="What you have watched" columns="grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Episodes watched"
          value={figures.episodesWatched.toLocaleString("en-GB")}
        />
        <Figure label="Films watched" value={figures.filmsWatched.toLocaleString("en-GB")} />
        <Figure label="Shows watched" value={figures.showsWatched.toLocaleString("en-GB")} />
        <Figure
          label="Shows completed"
          value={figures.showsCompleted.toLocaleString("en-GB")}
        />
      </Section>

      {/*
        And nothing else. `figures.titles` is read by this page and deliberately not
        printed by it: it decides the empty branch in `page.tsx` and is not a seventh
        figure. #245 is explicit that the figures the reader asked for are the whole of
        what You reports, and a page that reports six things plus one more is a page that
        has started drifting back towards the nine it replaced.
      */}
      {qualifies === null ? null : (
        <p className="px-[22px] pt-1 pb-2 text-item leading-relaxed text-dim lg:px-10">
          {qualifies}
        </p>
      )}
    </div>
  );
}
