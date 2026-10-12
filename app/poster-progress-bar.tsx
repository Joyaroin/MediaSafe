import { libraryProgressFraction } from "@/app/(signed-in)/library/library-progress-fraction";

/**
 * The watched-progress bar, drawn across the foot of a poster.
 *
 * ── Where it used to be, and why it moved ────────────────────────────────────────────
 *
 * Issue #324 put this bar under the card's *name*, as a row of its own. It is on the
 * artwork now, flush to the poster's bottom edge. What that buys is a column: a bar under
 * the name added a line of height to all 472 cells of the bill and pushed every name a
 * little further from the poster it belongs to, to say a thing that is *about* the poster.
 * On the artwork it costs no height at all.
 *
 * It renders inside `Poster` rather than beside it (`app/poster.tsx`'s `children`), so the
 * `poster` utility's `overflow: hidden` clips it to that surface's own radius. A bar
 * positioned against a sibling wrapper would leave square corners poking out of a rounded
 * poster, and the fix for that would be restating the radius — the exact thing the utility
 * exists to stop a call site doing.
 *
 * ── Charcoal: `3px` of white, and no track (handoff §6) ────────────────────────────
 *
 * The poster cell's bar is *a `3px` white bar along the poster's bottom edge*, the same on
 * phone and desktop. White rather than the accent, because the accent is the text colour
 * now and would be near-black on a light theme, over artwork it does not know; and no
 * track, because the boards draw none. The `5px` rule on a `--ground` track it replaces
 * was the accent's answer to the same question.
 *
 * White over artwork only: a title with no artwork is the `raised` initials tile, white
 * in light, so `Poster` sets `--poster-ink` to `text` there and the bar reads it.
 *
 * What the track used to say — *started, none watched* — is still in the markup as a bar
 * at `0%`; the cell's state line says it in words.
 *
 * ── `null` draws nothing, and the absences it stands for ─────────────────────────────
 *
 * `libraryProgressFraction` answers `null` for a show with nothing released, and a caller
 * passes `null` progress for a film and — on a list — for a title this account does not
 * own. Three different reasons for one absence, and none of them may render as a bar at
 * zero: an empty bar says *started and watched none*, which is a claim about the reader.
 */
export function PosterProgressBar({
  progress,
}: {
  /** Watched against released, or `null` when there is no bar to draw — see above. */
  readonly progress: { readonly watched: number; readonly released: number } | null;
}) {
  const fraction =
    progress === null ? null : libraryProgressFraction(progress.watched, progress.released);

  if (fraction === null) return null;

  return (
    /**
     * `aria-hidden`, like every other layer of a poster. The bar states a fact that is
     * either written in words on the same surface or one press away on the title's own
     * page, and a `progressbar` role would announce a percentage nobody wrote — the same
     * decision `title-hero.tsx` records for the bar that *does* have a sentence under it.
     */
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden">
      {/**
       * The fill is the bar's full width, slid left by what is not watched, and the box
       * above clips it — a `transform`, because handoff §11.4 never animates `width`
       * (issue #407), and a slide rather than a `scaleX`, which would flatten the poster's
       * own rounded corner along with the fill's end.
       * `--dur-base` because a watch landing is a routine state change, the same ramp
       * position `WatchedBar` below ties itself to. `progress-fill` carries no rule of its
       * own; it is only what `globals.css`'s reduced-motion block targets to collapse the
       * duration — issue #335's *the event survives, the animation does not*.
       */}
      <div
        className="progress-fill h-full w-full bg-[var(--poster-ink,white)] transition-transform duration-[var(--dur-base)]"
        style={{ transform: `translateX(${fraction * 100 - 100}%)` }}
      />
    </div>
  );
}
