import type { ReactNode } from "react";

import { posterSrc } from "@/app/poster";
import { posterBandStyle, titleScrimGradient } from "@/app/poster-tint";
import { HeroPoster } from "./hero-poster";
import { seasonHeading } from "./season-grouping";

/**
 * The head of a title's page — issue #357 — shared by a title you own and one you do not.
 *
 * ── One layout, and what varies ──────────────────────────────────────────────────────
 *
 * There used to be two detail pages: an owned title's, with a small poster beside its
 * facts, and a catalogue title's, with a full-width poster and a square *Add to My Shows*
 * button. Now both render this: the poster over a softened copy of itself that fades into
 * the page, the title and its facts beside it, and one row of actions under them. The
 * caller decides what goes in `actions` and `status`; the page is otherwise the same page.
 *
 * ── The backdrop is the poster, softened ─────────────────────────────────────────────
 *
 * The mirror stores no backdrop art — backdrops are live TMDB facts nothing fetches yet —
 * so the band behind the head is the poster itself, enlarged, blurred and faded into the
 * ground. It is decoration: `aria-hidden`, lazy, and absent when there is no poster.
 *
 * ── On a band of the poster's own colour — Charcoal, issue #398 ──────────────────────
 *
 * Under the softened poster is the band (`app/poster-tint.ts`'s `BAND`): the stored hue
 * at 52% lightness, one value for both themes. It replaced issue #361's pale wash. A
 * title with no stored colour has no band; the area shows `raised`, nothing guessed.
 *
 * Over both is a `ground` scrim, and it is **measured from the text, not the artwork**:
 * the head row is the band's own box, so the band ends where the text block ends, and the
 * scrim's stops sit at fixed distances from `--hero-text-top`, the row's top padding —
 * where the text block (or the poster beside it, if that is taller) begins. A name that
 * wraps grows the block downward into more scrim. `tests/poster-tint.test.ts` composites
 * the same stops over white and black artwork against handoff §10's floors.
 *
 * ── It recedes as you scroll — issue #369 ────────────────────────────────────────────
 *
 * `hero-recede-band` and `hero-recede-poster` are a CSS scroll-driven animation
 * (`app/globals.css`): the band fades and the poster shrinks as the page scrolls toward
 * the episodes. No script, and static where the browser or the reader says so.
 *
 * ── The poster sizes off its wrapper ─────────────────────────────────────────────────
 *
 * The wrapper carries the width and the `view-transition-name`, and the poster fills it
 * (`w-full`). A percentage or fixed width on the poster inside a shrink-to-fit wrapper sizes
 * the pair down to almost nothing — `titles/[entryId]/pending-poster.tsx` is built the same
 * way so the morph's two halves are one size.
 */
export function TitleHero({
  name,
  posterPath,
  posterColour,
  posterTransitionName,
  libraryEntryId,
  status,
  meta,
  progress,
  actions,
  synopsis,
  back,
}: {
  name: string;
  posterPath: string | null;
  /** `title.poster_colour` — `null` draws the untinted band. */
  posterColour: string | null;
  /** The poster morph's name, when a surface opened this page with one. */
  posterTransitionName?: string;
  /** The entry this hero is for — what `HeroPoster` reads the carried image by. */
  libraryEntryId?: string;
  /** Where the title stands, as a pill — owned titles only. */
  status?: {
    readonly label: string;
    /** A line under the pill, when the state needs one — *Dropped* says how it clears. */
    readonly note?: string;
  } | null;
  meta: string | null;
  /** Episodes watched of one season's episodes — shows only (`seasonWatchProgress`). */
  progress?: {
    readonly watched: number;
    readonly total: number;
    readonly seasonNo: number;
  } | null;
  /** The main button, then the secondary ones. */
  actions: ReactNode;
  /**
   * The synopsis, as a **node** — a streamed live fact on the owned page, part of the
   * catalogue's facts on the other. `null` leaves the space out entirely.
   */
  synopsis?: ReactNode;
  /** The round back button, laid over the band (`BackBar overArtwork`, Charcoal §8.6). */
  back?: ReactNode;
}) {
  return (
    // `-mt-3` gives back the signed-in layout's phone padding, so the band runs to the top
    // edge as the board draws it (Charcoal §8.6). Desktop has no such padding.
    <section className="relative -mt-3 lg:mt-0">
      {back}
      {/* `--hero-text-top` is `124px` now (Charcoal §8.6's board): the back button sits over
          the band instead of on a bar above it, so the head row clears it on its own. The
          scrim still reads every stop from here, so nothing about §10's floors moves. */}
      <div
        className="relative isolate flex items-end gap-4 px-gutter pt-[var(--hero-text-top)] [--hero-text-top:7.75rem] lg:gap-8 lg:px-10 lg:[--hero-text-top:13.5rem]"
        style={posterBandStyle(posterColour)}
      >
        <HeroBand posterPath={posterPath} />

        <div
          className="hero-recede-poster shrink-0"
          style={
            posterTransitionName === undefined
              ? undefined
              : { viewTransitionName: posterTransitionName, viewTransitionClass: "poster" }
          }
        >
          <HeroPoster libraryEntryId={libraryEntryId} posterPath={posterPath} name={name} />
        </div>

        {/* `arrive-panel` here and on the actions, and **not** on the section: the poster
            is the morph's landing, and an ancestor animating from `opacity: 0` and 8px
            down took the poster with it — it faded and dropped right after it landed, the
            jerk at the end of every morph (UI overhaul). Everything around it still
            arrives. */}
        <div className="arrive-panel flex min-w-0 flex-1 flex-col items-start gap-1.5 pb-0.5">
          {status === null || status === undefined ? null : (
            <p
              // `ground` at 85%: the tag sits at the very top of the text block, so it brings
              // its own backing — with the scrim under it, 90% (`TITLE_SCRIM.stateTagBacking`).
              //
              // The state tag (Charcoal §6): the Label register in `text`, never a colour —
              // the word is the state, and the tag is not a chip, so nothing presses it.
              className="label-line rounded-[var(--radius-full)] bg-ground/85 px-2.5 py-1 text-text"
            >
              {status.label}
            </p>
          )}
          {status?.note === undefined ? null : (
            <p className="text-meta text-dim">{status.note}</p>
          )}

          {/* Title size on both widths (Charcoal §5.3), two lines at most and then the
              ellipsis (§8.6). `hyphens-auto` and `break-words` because the column beside a
              `108px` poster is about `222px`, and one long word at `56px` is wider than that.
              The whole name stays in the DOM, so a screen reader hears all of it. */}
          <h1 className="bill-title line-clamp-2 self-stretch break-words text-bill-xl text-text hyphens-auto">
            {name}
          </h1>

          {meta === null ? null : (
            <p className="text-meta text-dim" data-numeric>
              {meta}
            </p>
          )}

          {progress === null || progress === undefined ? null : (
            <WatchedBar
              watched={progress.watched}
              total={progress.total}
              seasonNo={progress.seasonNo}
            />
          )}
        </div>
      </div>

      <div className="arrive-panel relative mt-4 flex flex-col gap-3.5 px-gutter lg:px-10 lg:pl-[272px]">
        {/* One row: the filled action takes what is left, the square icon buttons sit at
            its end (§8.6). `lg:max-w` so it does not stretch across a desktop column. */}
        <div className="flex items-center gap-2 lg:max-w-[480px]">{actions}</div>
        {synopsis}
      </div>
    </section>
  );
}

/**
 * The band, the softened poster, and the scrim — the head row's own background, behind
 * the poster and the text (`-z-10` inside the row's `isolate`). The band reads `--band`
 * from the row, or `raised` when the title has none. `hero-recede-band` fades and folds
 * all three together as the page scrolls, which only ever leaves more `ground` behind
 * the text, never less.
 */
function HeroBand({ posterPath }: { posterPath: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="hero-recede-band absolute inset-0 -z-10 overflow-hidden bg-[var(--band,var(--color-raised))]"
    >
      {posterPath === null ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- decoration behind the head, from the same TMDB CDN `poster.tsx` reads with a plain <img> for its own stated reasons
        <img
          src={posterSrc(posterPath, 342)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        />
      )}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: titleScrimGradient("var(--hero-text-top)") }}
      />
    </div>
  );
}

/**
 * How far through **this season** you are (Charcoal §8.6): one `4px` bar, then *1 of 8 ·
 * Season 1*. The fill is the accent, which is `text` now; the track is `text` at 20%, one
 * value that reads as §6's *24% white* in dark and *16% ink* in light closely enough to
 * need no theme branch.
 */
function WatchedBar({
  watched,
  total,
  seasonNo,
}: {
  watched: number;
  total: number;
  seasonNo: number;
}) {
  const filled = total === 0 ? 0 : Math.round((watched / total) * 100);

  return (
    <div className="mt-1 w-full max-w-[420px]">
      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-[var(--radius-full)] bg-[color-mix(in_oklab,var(--color-text)_20%,transparent)]"
      >
        {/* Slid, not sized: handoff §11.4 never animates `width` (issue #407). */}
        <div
          className="progress-fill h-full w-full rounded-[var(--radius-full)] bg-accent transition-transform duration-[var(--dur-base)]"
          style={{ transform: `translateX(${filled - 100}%)` }}
        />
      </div>

      <p className="mt-1.5 text-meta text-dim" data-numeric>
        {watched} of {total} · {seasonHeading(seasonNo)}
      </p>
    </div>
  );
}
