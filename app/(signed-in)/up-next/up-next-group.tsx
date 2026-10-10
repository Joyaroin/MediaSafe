import { CARD_GRID } from "./up-next-card-styles";

/**
 * One group of Up next — a labelled grid of cards (`up-next-card.tsx`).
 *
 * It was a hairline-divided list of rows, and a horizontal rail before that (#250). The
 * cards are the UI overhaul's: Coming up's material, at a poster small enough that a phone
 * screen holds seven shows rather than three.
 *
 * ── `hideLabel` ──────────────────────────────────────────────────────────────────────
 *
 * Continue watching's label sat under a pager tab that already said *Watching*, under a
 * screen heading that already said *Up next* — three labels for one list. The label is
 * still a real `h2`, so the page's outline is unchanged for a screen reader; it is only
 * not painted.
 */
export function UpNextGroup({
  label,
  hideLabel = false,
  rule,
  more,
  children,
}: {
  readonly label: string;
  readonly hideLabel?: boolean;
  /** The one-line statement of what puts a title in this group. Absent on the phone,
   *  where the screen is narrow enough that the label alone is the whole head. */
  readonly rule?: string;
  /** Where the rest of this group lives, when it is bounded by a count rather than by its
   *  membership. Absent means the group is showing all of itself. */
  readonly more?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="pt-6 first:pt-0">
      {hideLabel ? (
        <h2 className="sr-only">{label}</h2>
      ) : (
        <div className="flex items-baseline justify-between gap-3 px-gutter pb-2">
          <div className="flex items-baseline gap-3">
            <h2 className="label-line text-dim">{label}</h2>
            {rule === undefined ? null : <p className="code-line text-dim">{rule}</p>}
          </div>
          {more === undefined ? null : (
            <a href={more} className="code-line text-dim hover:text-text">
              More ›
            </a>
          )}
        </div>
      )}

      <ol className={CARD_GRID}>{children}</ol>
    </section>
  );
}
