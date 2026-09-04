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
 * ── The accent on artwork, which §6 refuses for the press sweep ──────────────────────
 *
 * `DESIGN.md` §6 rules the press sweep off a poster in as many words: *across a poster it
 * would be the accent painting artwork*. This is the accent on artwork, so the difference
 * has to be said rather than assumed. The sweep is a **wash over the whole tile** for
 * 380ms — at that size and that speed it is the artwork that changes colour. This is a
 * `5px` rule at the bottom edge, permanent, reading as a measure on the frame rather than
 * as a colour applied to the picture, and it is the same `LIVE_EDGE_OF_THE_RECORD` role
 * the bar already claimed under the name. §6's rule is about the wash and is untouched.
 *
 * ── `5px`, which is thicker than it was under the name ───────────────────────────────
 *
 * `4px` under the card's name, then `3px` when it moved onto the artwork — a rule on a
 * poster looked like it wanted to be finer than one on the ground, and at the sizes this
 * actually draws it read as a hairline instead. `5px` is the measured answer: on the bill's
 * `132px` poster it is 2.5% of the height, and on a list row's `56px` one it is the
 * smallest rule that still reads as a bar rather than as an edge of the artwork.
 *
 * ── The track is `--ground` at `70%`, not `--hair` ───────────────────────────────────
 *
 * Under the name the track was `bg-hair`, which works over a known ground and disappears
 * over artwork — a hairline tone against a poster that might be white, black or anything
 * between. A translucent `--ground` reads as the same unfilled track over all of them.
 * `app/globals.css` sanctions exactly this: *the rail arrows keep `bg-ground/80` … they sit
 * over moving artwork rather than over type, which is the one place §5 sanctions a second
 * opacity*. This is that case, at `70%` — dark enough to sit under the fill on pale
 * artwork, light enough to read as empty rather than as a second fill.
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
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[5px] bg-ground/70">
      <div className="h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}
