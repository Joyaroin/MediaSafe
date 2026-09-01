/**
 * One figure and its label, on a page that is about to destroy what it counts.
 *
 * Two surfaces render these — `settings/delete-account/page.tsx`'s three (titles, watches,
 * ratings) and `titles/[entryId]/remove/page.tsx`'s two (this title's watches, and its
 * rating if it has one). It is written once for the reason
 * `titles/[entryId]/remove/remove-frame.tsx` gives for its own heading and
 * `errors/failure-treatment.ts` gives for its class strings: *written out twice, the two
 * drift* — and these are the two screens in the product where the figure a reader acts on
 * cannot be taken back, so the pair drifting apart is not a cosmetic outcome.
 *
 * It lives at `app/` rather than beside either caller because they are in different route
 * segments and neither owns it, which is the same placement `app/plate.tsx` and
 * `app/tmdb-attribution.tsx` already have.
 *
 * ── `data-numeric` and the explicit locale ───────────────────────────────────────────
 *
 * `data-numeric` turns on `tabular-nums` (`app/globals.css`). `en-GB` grouping is passed
 * rather than left to the server's locale for two reasons: 18,715 read as 18715 is a number
 * a reader has to count the digits of, and a number that changes shape depending on which
 * machine rendered it is worse than either.
 *
 * ── `outOf`, and why a score is not a count ──────────────────────────────────────────
 *
 * Every figure on the delete-account page is a row count, and the remove page's *Watches*
 * is another. Its *Your rating* is not: 8 there is a score out of ten, and drawn in the
 * same slot as *118 Watches* under a heading reading **What this destroys** it reads as
 * eight things. `outOf` is what keeps that from being a figure the page states wrongly on
 * the one screen whose figures are the whole argument for pressing the button.
 *
 * The denominator is dimmed rather than merely appended, so the value stays the thing the
 * eye lands on; and grouping is skipped with it, because a 1-10 value has no thousands
 * separator to place and `toLocaleString` on it is inert.
 */
export function DestroyedFigure({
  label,
  count,
  outOf,
}: {
  readonly label: string;
  readonly count: number;
  /** Present only where the figure is a score rather than a quantity. */
  readonly outOf?: number;
}) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="code-line mt-2 text-dim">{label}</dt>
      <dd className="bill-title text-bill-lg text-text" data-numeric>
        {outOf === undefined ? (
          count.toLocaleString("en-GB")
        ) : (
          <>
            {count}
            <span className="text-dim">/{outOf}</span>
          </>
        )}
      </dd>
    </div>
  );
}
